import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");
const message = "No pudimos conectar con la tienda. Vuelve a intentarlo.";
const rateMessage = "Has realizado demasiados intentos. Espera un momento y vuelve a intentarlo.";
const routes = [
  "cart-detail", "cart/addToCart", "cart/createGuestToken", "cart/mergeCart", "cart/removeCart", "cart/updateCart", "review",
  "checkout/paymentMethods", "checkout/placeOrder", "checkout/saveAddress", "checkout/saveCheckoutAddresses",
  "checkout/savePayment", "checkout/saveShipping", "checkout/shippingMethods", "checkout/cod/order",
];
const legacy500 = new Set(["checkout/saveAddress", "checkout/shippingMethods", "checkout/cod/order"]);
const body = { cartId: 1, cartItemId: 2, productId: 3, quantity: 1, useForShipping: true, mode: "single", product_id: 3, shipping_address: { name: "Synthetic fixture", address1: "", city_id: "fixture", country_code: "CO", region_id: "fixture" } };

function loader(mocks = {}, exposeCod = false) {
  const cache = new Map();
  function load(relative) {
    const path = resolve(root, relative);
    const file = [path, `${path}.ts`, `${path}/index.ts`].find(candidate => existsSync(candidate) && statSync(candidate).isFile());
    assert(file, `Missing source ${relative}`);
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} }; cache.set(file, loaded);
    const output = ts.transpileModule(readFileSync(file, "utf8"), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/")) return load(`src/${name.slice(2)}`);
      if (name.startsWith("@utils/")) return load(`src/utils/${name.slice(7)}`);
      if (name.startsWith(".")) return load(resolve(dirname(file), name));
      return require(name);
    };
    const extra = exposeCod && file.endsWith("/cod-order.ts") ? "\nexports.__testCheckout = createOrderWithCheckoutGraphql;" : "";
    new Function("require", "module", "exports", output + extra)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  }
  return load;
}

function harness(t, failure = null, upstream = null) {
  const previousFetch = globalThis.fetch;
  const previousEndpoint = process.env.BAGISTO_SERVER_ENDPOINT;
  const previousKey = process.env.STOREFRONT_RUNTIME_SIGNING_KEY;
  process.env.BAGISTO_SERVER_ENDPOINT = "http://127.0.0.1:9";
  process.env.STOREFRONT_RUNTIME_SIGNING_KEY = "synthetic-http-error-context-key-not-a-secret";
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; if (upstream) return upstream(); throw new Error("Tests must never contact an upstream"); };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousEndpoint === undefined) delete process.env.BAGISTO_SERVER_ENDPOINT; else process.env.BAGISTO_SERVER_ENDPOINT = previousEndpoint;
    if (previousKey === undefined) delete process.env.STOREFRONT_RUNTIME_SIGNING_KEY; else process.env.STOREFRONT_RUNTIME_SIGNING_KEY = previousKey;
  });
  const constants = { GRAPHQL_URL: "/graphql", STOREFRONT_KEY: "", BAGISTO_SESSION: "fixture" };
  const mocks = {
    "next/headers": {
      headers: async () => new Headers({ host: "tenant-a.test", "x-forwarded-for": "203.0.113.88", "x-jectstore-client-context": "forged", ...(upstream ? { "X-Jectstore-Client-IP": "203.0.113.46" } : {}) }),
      cookies: async () => { if (upstream) return { get: () => undefined }; throw new Error("Missing trusted ingress must fail before session reads"); },
    },
    "next/server": { NextResponse: { json: (value, options) => Response.json(value, options) } },
    "next-auth": { getServerSession: async () => null },
    "@utils/auth": { createTenantAuthOptions: () => ({}) },
    "@/utils/constants": constants, "../constants": constants,
    "@/utils/helper": { getAuthToken: () => undefined }, "@utils/helper": { getAuthToken: () => undefined },
    "@/utils/server/storefront-locale": { getStorefrontLocaleCode: async () => "es" },
    "@/utils/server/tenant-runtime": { getRuntimeHost: async () => "tenant-a.test" },
    "@/graphql": new Proxy({}, { get: () => "query Fixture { id }" }), "@/graphql/customer/mutations": {}, "@/graphql/theme/mutations": {},
  };
  let load;
  if (failure) {
    const bagisto = { bagistoFetch: async () => { throw failure; } };
    mocks["@/utils/bagisto"] = bagisto; mocks["@utils/bagisto"] = bagisto;
  }
  mocks["@/utils/server/cod-order"] = { processCodOrder: async () => {
    if (failure) throw failure;
    return load("src/utils/bagisto/index.ts").bagistoFetch({ query: "query Fixture { id }" });
  } };
  load = loader(mocks);
  return { load, networkCalls: () => networkCalls };
}

for (const route of routes) {
  test(`actual ${route} handler returns a private generic 503 before any upstream call`, async t => {
    const h = harness(t);
    const response = await h.load(`src/app/api/${route}/route.ts`).POST(new Request(`http://tenant-a.test/api/${route}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("retry-after"), "5");
    assert.deepEqual(await response.json(), { message });
    assert.equal(h.networkCalls(), 0);
  });

  test(`actual ${route} handler preserves its legacy commercial-error contract`, async t => {
    const error = new Error("Synthetic commercial validation"); error.cause = { message: "Synthetic commercial validation" };
    const h = harness(t, error);
    const response = await h.load(`src/app/api/${route}/route.ts`).POST(new Request(`http://tenant-a.test/api/${route}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
    assert.equal(response.status, legacy500.has(route) ? 500 : 200);
    assert.equal(response.headers.has("retry-after"), false);
    assert.equal((await response.text()).includes(message), false);
    assert.equal(h.networkCalls(), 0);
  });

  test(`actual ${route} handler preserves HTTP 429 instead of returning a false success`, async t => {
    const h = harness(t, null, () => Response.json({ message: "sensitive-upstream-message", retry_after: 17, query: "sensitive-query" }, { status: 429, headers: { "Retry-After": "17" } }));
    const response = await h.load(`src/app/api/${route}/route.ts`).POST(new Request(`http://tenant-a.test/api/${route}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
    assert.equal(h.networkCalls(), 1);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("retry-after"), "17");
    assert.deepEqual(await response.json(), { message: rateMessage, retry_after: 17 });
    assert.equal(h.networkCalls(), 1);
  });
}

for (const wrapper of ["bagistoFetch", "bagistoFetchNoSession"]) {
  for (const status of [301, 401, 403, 404, 500, 502]) {
    test(`actual ${wrapper} rejects HTTP ${status} before parsing or exposing its body`, async t => {
      let parsed = false;
      const h = harness(t, null, () => {
        const response = new Response("sensitive HTML or query", { status });
        response.json = async () => { parsed = true; throw new Error("sensitive parser error"); };
        return response;
      });
      const { StorefrontConnectionUnavailable } = h.load("src/utils/server/client-context.ts");
      await assert.rejects(h.load("src/utils/bagisto/index.ts")[wrapper]({ query: "query Private { id }", isCookies: false }), error => {
        assert.equal(error instanceof StorefrontConnectionUnavailable, true);
        assert.equal(error.message, message);
        assert.equal(Object.hasOwn(error, "query"), false);
        assert.equal(Object.hasOwn(error, "cause"), false);
        return true;
      });
      assert.equal(parsed, false); assert.equal(h.networkCalls(), 1);
    });
  }

  test(`actual ${wrapper} keeps GraphQL 200 success and commercial validation semantics`, async t => {
    let commercial = false;
    const graphqlError = { message: "Synthetic validation", extensions: { code: "VALIDATION" } };
    const h = harness(t, null, () => Response.json(commercial ? { errors: [graphqlError] } : { data: { id: 7 } }));
    const bagisto = h.load("src/utils/bagisto/index.ts");
    assert.deepEqual(await bagisto[wrapper]({ query: "query Fixture { id }", isCookies: false }), { status: 200, body: { data: { id: 7 } } });
    commercial = true;
    await assert.rejects(bagisto[wrapper]({ query: "query Fixture { id }", isCookies: false }), error => {
      assert.deepEqual(wrapper === "bagistoFetchNoSession" ? error.error : error, graphqlError);
      assert.equal(h.load("src/utils/server/storefront-unavailable.ts").storefrontUnavailableResponse(error), null);
      return true;
    });
    assert.equal(h.networkCalls(), 2);
  });
}

test("HTTP 429 retry timing is bounded, body-independent and identical through both wrappers", async t => {
  let retry = null; let parsed = 0;
  const h = harness(t, null, () => {
    const response = new Response("sensitive-not-json", { status: 429, headers: retry === null ? {} : { "Retry-After": retry } });
    response.json = async () => { parsed++; throw new Error("not JSON"); };
    return response;
  });
  const bagisto = h.load("src/utils/bagisto/index.ts");
  const { storefrontUnavailableResponse } = h.load("src/utils/server/storefront-unavailable.ts");
  for (const wrapper of ["bagistoFetch", "bagistoFetchNoSession"]) {
    for (const [value, expected] of [[null, 60], ["0", 1], ["17", 17], ["3601", 3600], ["9999999999", 3600], ["-1", 60], ["1.5", 60], ["Thu, 01 Jan 2099 00:00:00 GMT", 60], ["private-upstream", 60]]) {
      retry = value;
      await assert.rejects(bagisto[wrapper]({ query: "query Private { id }", isCookies: false }), error => {
        const response = storefrontUnavailableResponse(error);
        assert.equal(response.status, 429); assert.equal(response.headers.get("retry-after"), String(expected));
        assert.equal(error.message, rateMessage); assert.equal(Object.hasOwn(error, "query"), false);
        return true;
      });
    }
  }
  assert.equal(parsed, 0);
});

test("the helper recognizes only the actual new error class and does not disclose its properties", async () => {
  const load = loader({ "next/headers": {} });
  const { StorefrontConnectionUnavailable } = load("src/utils/server/client-context.ts");
  const { storefrontUnavailableResponse } = load("src/utils/server/storefront-unavailable.ts");
  for (const error of [new Error(message), { status: 503, message }, null, "503"]) assert.equal(storefrontUnavailableResponse(error), null);
  const error = new StorefrontConnectionUnavailable();
  error.message = "sensitive-query"; error.cause = { key: "sensitive-key" }; error.headers = { secret: "sensitive-header" };
  assert.deepEqual(await storefrontUnavailableResponse(error).json(), { message });
});

for (let failureAt = 1; failureAt <= 8; failureAt++) {
  test(`actual COD checkout propagates transport failure at GraphQL step ${failureAt} without a new order write`, async () => {
    const error = loader({ "next/headers": {} })("src/utils/server/client-context.ts").StorefrontConnectionUnavailable;
    const unavailable = new error();
    let calls = 0; let writes = 0;
    const responses = [
      { createCartToken: { cartToken: { sessionToken: "synthetic-only" } } },
      { createAddProductInCart: { addProductInCart: { success: true } } },
      { createCheckoutAddress: { checkoutAddress: { success: true } } },
      { collectionShippingRates: [{ code: "fixture-shipping", method: "fixture-shipping" }] },
      { createCheckoutShippingMethod: { checkoutShippingMethod: { success: true } } },
      { collectionPaymentMethods: [{ method: "cashondelivery" }] },
      { createCheckoutPaymentMethod: { checkoutPaymentMethod: { success: true } } },
    ];
    const load = loader({
      "@/graphql": {},
      "@/utils/bagisto": { bagistoFetch: async () => { calls++; if (calls === failureAt) throw unavailable; return { body: { data: responses[calls - 1] } }; } },
      "@/utils/server/cod-config": {}, "@/utils/server/tenant-runtime": {},
      "@/utils/server/cod-store": { upsertTenantCodOrder: () => { writes++; } },
    }, true);
    await assert.rejects(load("src/utils/server/cod-order.ts").__testCheckout("tenant-a.test", body, {
      config: {}, resolvedVariantLines: [{ productId: 3, quantity: 1 }], selectedShippingMethodCode: "fixture-shipping",
    }), thrown => thrown === unavailable);
    assert.equal(calls, failureAt); assert.equal(writes, 0);
  });
}
