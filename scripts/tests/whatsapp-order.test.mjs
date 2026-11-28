import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { loader } from "../../tests/product-preview-test-helpers.mjs";

function loadCheckoutSource(file, dependencies = {}) {
  const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, URL, Number, require: (name) => {
    assert.ok(Object.hasOwn(dependencies, name), name);
    return dependencies[name];
  } });
  return exports;
}

const checkout = () => loadCheckoutSource("src/utils/whatsapp-order.ts");

test("checkout accepts a safe receipt and never gives the browser the receipt proof", () => {
  const result = checkout().parseWhatsAppOrder({
    id: 41, number: "1001", status: "pending",
    whatsappUrl: "https://wa.me/573001001001?text=Pedido%20%231001",
    receiptToken: "private-receipt",
  });
  assert.equal(result.whatsappUrl, "https://wa.me/573001001001?text=Pedido%20%231001");
  assert.equal(result.number, "1001");
  assert.equal(Object.hasOwn(result, "receiptToken"), false);
});

test("an unexpected redirect target or malformed order never creates a WhatsApp action", () => {
  const { parseWhatsAppOrder } = checkout();
  const order = { id: 41, number: "1001", status: "pending" };
  for (const value of ["http://wa.me/573001001001", "https://wa.me.example.test/573001001001", "https://fake@wa.me/573001001001", "https://wa.me/nonnumeric"]) {
    assert.equal(parseWhatsAppOrder({ ...order, whatsappUrl: value }).whatsappUrl, null);
  }
  assert.equal(parseWhatsAppOrder({ ...order, id: 0 }), null);
});

test("the real order endpoint scopes creation to the posted cart and keeps the proof in a secure cookie", async () => {
  const calls = [];
  const cookies = [];
  const proof = "a".repeat(64);
  const { POST } = loadCheckoutSource("src/app/api/checkout/placeOrder/route.ts", {
    "@/lib/storefront-experience/runtime": loader()("src/lib/storefront-experience/runtime.ts"),
    "@/graphql": { CREATE_CHECKOUT_ORDER: "incumbent" },
    "@/graphql/checkout/whatsapp-order": { CREATE_WHATSAPP_ORDER: "whatsapp" },
    "@/utils/server/storefront-unavailable": { storefrontUnavailableResponse: () => null },
    "@utils/type-guards": { isBagistoError: () => false },
    "@/utils/helper": { getAuthToken: () => "authorized-cart" },
    "@utils/bagisto": { bagistoFetch: async (options) => {
      calls.push(options);
      return { body: { data: { createWhatsAppOrder: { id: 41, number: "1001", status: "pending", receiptToken: proof } } } };
    } },
    "@/utils/whatsapp-order": checkout(),
    "next/server": { NextResponse: { json: (body, init) => ({ body, init, cookies: { set: (...args) => cookies.push(args) } }) } },
  });
  const call = (origin, body, headers = {}) => POST(new Request("http://127.0.0.1:3000/api/checkout/placeOrder", {
    method: "POST",
    headers: { host: "shop.example.test", origin, "x-forwarded-proto": "https", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }));
  assert.equal((await call("https://other.test", { whatsappCartId: 7 })).init.status, 403);
  assert.equal((await call("https://shop.example.test", { whatsappCartId: 7, destination: "untrusted" })).init.status, 400);
  assert.equal((await call("https://other.test", { whatsappCartId: 7 }, { "x-forwarded-host": "other.test" })).init.status, 403);
  assert.equal((await call("http://shop.example.test", { whatsappCartId: 7 })).init.status, 403);
  assert.equal((await call("https://shop.example.test", { whatsappCartId: 7 }, { "x-forwarded-proto": "http, https" })).init.status, 403);
  assert.equal((await call("https://shop.example.test", { whatsappCartId: 7 }, { "Content-Type": "application/json-other" })).init.status, 403);
  assert.equal(calls.length, 0);

  const accepted = await call("https://shop.example.test", { whatsappCartId: 7 });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].variables)), { cartId: 7 });
  assert.deepEqual(JSON.parse(JSON.stringify(accepted.body)), { whatsappOrder: { id: 41 } });
  assert.equal(accepted.init.headers["Cache-Control"], "private, no-store");
  const [name, value, options] = cookies[0];
  assert.equal(name, "jectstore_whatsapp_receipt");
  assert.equal(value, proof);
  assert.deepEqual(JSON.parse(JSON.stringify(options)), {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 900, path: "/checkout/whatsapp-order",
  });
});


test("the v3 proxy keeps the receipt in Next even when the store uses native Visual", async t => {
  const env = { STOREFRONT_EXPERIENCES_ENABLED: "true", STOREFRONT_EXPERIENCE_HOSTS: "shop.example.test", STOREFRONT_EXPERIENCE_HOST_POLICY: "pilot", STOREFRONT_NATIVE_ORIGIN: "http://127.0.0.1:9000", NEXTAUTH_SECRET: "" };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }

  const next = loader();
  const runtime = next("src/lib/storefront-experience/runtime.ts");
  const resolvedHosts = [];
  const { proxy } = loader({ "@/lib/storefront-experience/runtime": {
    ...runtime,
    runtimeSigningKey: () => Buffer.alloc(32),
    fetchStorefrontExperience: async ({ host }) => {
      resolvedHosts.push(host);
      return { engine: "visual", base_key: "visual", published_revision_id: 7, locale: "es", channel: { id: 2 } };
    },
  } })("src/proxy.ts");
  const { NextRequest } = await import("next/server.js");
  const fromShop = path => new NextRequest("https://shop.example.test" + path, { headers: { host: "shop.example.test" } });

  const receipt = await proxy(fromShop("/checkout/whatsapp-order/41"));
  assert.equal(receipt.headers.get("x-middleware-next"), "1");
  assert.equal(receipt.headers.get("x-middleware-rewrite"), null);
  assert.match(receipt.headers.get("Cache-Control"), /no-store/);

  const checkout = await proxy(fromShop("/checkout"));
  assert.match(checkout.headers.get("x-middleware-rewrite"), /\/checkout$/);
  assert.deepEqual(resolvedHosts, ["shop.example.test", "shop.example.test"]);
});

test("payment methods offer WhatsApp only when Laravel enables it for the current checkout", async () => {
  const normalMethod = { id: "cashondelivery", method: "cashondelivery", title: "Contra entrega" };
  const calls = [];
  let available = true;
  const { POST } = loader({
    "@/graphql": { GET_CHECKOUT_PAYMENT_METHODS: "payment-methods" },
    "@/graphql/checkout/whatsapp-order": { CHECKOUT_WHATSAPP_AVAILABILITY: "availability" },
    "@/utils/server/storefront-unavailable": { storefrontUnavailableResponse: () => null },
    "@/utils/type-guards": { isBagistoError: () => false },
    "@/utils/helper": { getAuthToken: () => "current-cart" },
    "@/utils/bagisto": { bagistoFetch: async ({ query, guestToken, cache }) => {
      calls.push(query);
      assert.equal(guestToken, "current-cart");
      assert.equal(cache, "no-store");
      if (query === "availability" && available === null) throw new Error("Unknown field");
      return { body: { data: query === "availability" ? { storefrontWhatsAppOrderAvailable: available }
        : { collectionPaymentMethods: [normalMethod] } } };
    } },
  })("src/app/api/checkout/paymentMethods/route.ts");

  const request = new Request("https://shop.example.test/api/checkout/paymentMethods", { method: "POST" });
  const enabled = await POST(request);
  assert.deepEqual((await enabled.json()).data.map(method => method.id), ["cashondelivery", "whatsapp_order"]);
  assert.equal(enabled.headers.get("Cache-Control"), "private, no-store");
  for (available of [false, null]) {
    assert.deepEqual((await (await POST(request)).json()).data, [normalMethod]);
  }
  assert.deepEqual(calls, ["payment-methods", "availability", "payment-methods", "availability", "payment-methods", "availability"]);
});
