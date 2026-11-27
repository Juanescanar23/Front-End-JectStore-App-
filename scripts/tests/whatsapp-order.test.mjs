import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

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
  const call = (origin, body) => POST(new Request("https://shop.example.test/api/checkout/placeOrder", {
    method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  assert.equal((await call("https://other.test", { whatsappCartId: 7 })).init.status, 403);
  assert.equal((await call("https://shop.example.test", { whatsappCartId: 7, destination: "untrusted" })).init.status, 400);
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
