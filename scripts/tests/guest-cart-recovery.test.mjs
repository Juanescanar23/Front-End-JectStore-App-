import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { MutationObserver, QueryClient } from "@tanstack/query-core";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const constants = { GUEST_CART_TOKEN: "guest_cart_token", GUEST_CART_ID: "guest_cart_id", IS_GUEST: "is_guest" };
const fixtureKey = "synthetic-local-unit-fixture-key-not-a-real-secret";
function proof(cartId, tenant = "synthetic-tenant-a", database = "a".repeat(64)) {
  const payload = Buffer.from(JSON.stringify({ v: 1, purpose: "storefront_guest_cart", cart_id: cartId, tenant_id: tenant, database_scope: database, exp: 2147483647 })).toString("base64url");
  return `${payload}.${createHmac("sha256", fixtureKey).update(payload).digest("hex")}`;
}
const oldProof = proof(7);
const freshProof = proof(29);
const customerBearer = "synthetic.customer.bearer";
const cart = { id: "29", success: true, message: "", sessionToken: freshProof, isGuest: true, itemsQty: 1, itemsCount: 1, cartToken: "29", items: { edges: [] } };
const success = (value = cart) => ({ data: { createAddProductInCart: { addProductInCart: value } } });

function load(file, dependencies = {}, globals = {}) {
  const output = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const fixtureModule = { exports: {} };
  new Function(...Object.keys(globals), "require", "module", "exports", output)(
    ...Object.values(globals),
    (id) => { assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`); return dependencies[id]; },
    fixtureModule, fixtureModule.exports,
  );
  return fixtureModule.exports;
}

const envelope = load("src/utils/jwt-cookie.ts");
function cookieJar({ raw = oldProof, guest = true, blocked = false, ignoreWrites = false, throwWrites = false } = {}) {
  const values = raw === null ? {} : {
    [constants.GUEST_CART_TOKEN]: guest ? envelope.encodeJWT({ sessionToken: raw, cartId: 7, isGuest: true }) : raw,
    [constants.GUEST_CART_ID]: "7", [constants.IS_GUEST]: String(guest),
  };
  const writes = [];
  return { values, writes, document: {
    get cookie() { if (blocked) throw new Error("Cookie storage unavailable"); return Object.entries(values).map(([key, value]) => `${key}=${value}`).join("; "); },
    set cookie(value) {
      if (blocked || throwWrites) throw new Error("Cookie storage unavailable");
      if (ignoreWrites) return;
      const pair = value.split(";")[0], separator = pair.indexOf("=");
      values[pair.slice(0, separator)] = pair.slice(separator + 1);
      writes.push(value);
    },
  } };
}

function harness({ jar = cookieJar(), response = success(), upstream } = {}) {
  const requests = [], dispatched = [], notices = [], logs = [], state = [];
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
  const globals = { window: {}, document: jar.document, console: { error: (...args) => logs.push(args), warn: (...args) => logs.push(args) } };
  const cookies = load("src/utils/getCartToken.ts", { "@/utils/constants": constants, "@/utils/jwt-cookie": envelope }, globals);
  const fetcher = load("src/utils/fetch-handler.ts", {}, { fetch: async (url, options) => {
    assert.ok(["/api/cart/addToCart", "/api/cart/createGuestToken", "/api/cart-detail"].includes(url), "Only fixed same-origin cart endpoints are permitted");
    requests.push({ url, options });
    if (upstream) return upstream(url, options);
    if (url === "/api/cart/createGuestToken") return Response.json({ data: { createCartToken: { cartToken: { ...cart, id: "7", sessionToken: oldProof } } } });
    if (url === "/api/cart-detail") {
      return Response.json(options.headers.Authorization === `Bearer ${freshProof}`
        ? { data: { createReadCart: { readCart: cart } } }
        : { data: null, error: { message: "Synthetic expired cart session" } });
    }
    return Response.json(response);
  } });
  const guest = load("src/utils/hooks/useGuestCartToken.ts", {
    react: { useState(value) { const index = state.length; state.push(value); return [value, next => { state[index] = next; }]; }, useEffect() {}, useRef: value => ({ current: value }) },
    "../fetch-handler": fetcher, "@/utils/constants": constants,
    "@/utils/jwt-cookie": envelope, "../getCartToken": cookies,
  }, globals).useGuestCartToken();
  const hook = load("src/utils/hooks/useAddToCart.ts", {
    "@tanstack/react-query": { useMutation: options => {
      const observer = new MutationObserver(queryClient, options);
      return { mutateAsync: variables => observer.mutate(variables), isPending: false };
    } },
    "./useToast": { useCustomToast: () => ({ showToast: (...args) => notices.push(args) }) },
    "@/store/hooks": { useAppDispatch: () => action => dispatched.push(action) },
    "../fetch-handler": fetcher,
    "@/store/slices/cart-slice": { addItem: payload => ({ type: "fixture/add", payload }), clearCart: () => ({ type: "fixture/clear" }) },
    "@utils/type-guards": { isObject: value => value !== null && typeof value === "object" },
    "@utils/getCartToken": cookies,
    "./useGuestCartToken": { useGuestCartToken: () => guest },
    "@/utils/constants": constants,
    "@/utils/storefront-copy": { detectClientLocaleRoot: () => "es", getStorefrontCopy: key => key },
  }, globals).useAddProduct();
  const queries = [];
  const read = () => load("src/utils/hooks/useCartDetail.ts", {
    react: { useEffect() {} },
    "@tanstack/react-query": { useQuery: options => { queries.push(options); return { data: null, isLoading: false, refetch: options.queryFn }; } },
    "@/store/hooks": { useAppDispatch: () => () => {} },
    "../fetch-handler": fetcher,
    "@/store/slices/cart-slice": { addItem: value => value },
    "@utils/type-guards": { isObject: value => value !== null && typeof value === "object" },
    "@utils/getCartToken": cookies,
    "@utils/cart/normalize": { resolveReadCartPayload: value => value },
  }, globals).useCartDetail().getCartDetail();
  const addressQueryKey = () => {
    let key;
    load("src/utils/useAddress.ts", {
      "@tanstack/react-query": { useQuery: options => { key = options.queryKey; return {}; } },
      "./getCartToken": cookies, "./fetch-handler": fetcher,
    }, globals).useAddress();
    return key;
  };
  return { hook, guest, cookies, jar, state, requests, dispatched, notices, logs, read, queries, addressQueryKey };
}

for (const previousState of ["missing-cart", "inactive-cart", "previous-database-binding"]) {
  test(`${previousState}: trusted Add success replaces the guest proof and the next real read uses the replacement`, async () => {
    // The server decides that the prior cart is absent/inactive/outside its DB
    // binding. The client receives only the new current-tenant Add response.
    const old = previousState === "previous-database-binding" ? proof(7, "synthetic-tenant-a", "b".repeat(64)) : oldProof;
    const h = harness({ jar: cookieJar({ raw: old }) });
    assert.deepEqual(h.addressQueryKey(), ["address", old]);
    await h.hook.onAddToCart({ productId: "5", quantity: 1 });
    assert.equal(h.requests[0].options.headers.Authorization, `Bearer ${old}`);
    assert.deepEqual(JSON.parse(h.requests[0].options.body), { productId: 5, quantity: 1 });
    assert.equal(h.cookies.getCartToken(), freshProof);
    assert.equal(h.jar.values.guest_cart_id, "29");
    assert.equal(h.jar.values.is_guest, "true");
    assert.equal(h.state[0], freshProof);
    assert.equal(h.state[1], 29);
    assert.deepEqual(h.dispatched, [{ type: "fixture/add", payload: cart }]);
    assert.deepEqual(h.notices, [["addToCartSuccess", "success"]]);
    assert.equal((await h.read()).data.createReadCart.readCart.id, "29");
    assert.deepEqual(h.queries[0].queryKey, ["cart-detail", freshProof]);
    assert.deepEqual(h.addressQueryKey(), ["address", freshProof]);
    const reload = load("src/utils/getCartToken.ts", { "@/utils/constants": constants, "@/utils/jwt-cookie": envelope }, { document: h.jar.document });
    assert.equal(reload.getCartToken(), freshProof, "Recovery survives a module/page reload, not just Redux state");
    assert.equal(await h.guest.createGuestToken(), freshProof, "The existing creation helper reuses the recovered proof");
    assert.deepEqual(h.requests.map(entry => entry.url), ["/api/cart/addToCart", "/api/cart-detail"]);
    assert.deepEqual(h.logs, []);
  });
}

test("a customer Add response never overwrites customer auth cookies with a guest envelope", async () => {
  const h = harness({ jar: cookieJar({ raw: customerBearer, guest: false }), response: success({ ...cart, isGuest: false, sessionToken: customerBearer }) });
  const before = { ...h.jar.values };
  await h.hook.onAddToCart({ productId: "5", quantity: 1 });
  assert.deepEqual(h.jar.values, before);
  assert.deepEqual(h.jar.writes, []);
  assert.equal(h.requests[0].options.headers.Authorization, `Bearer ${customerBearer}`);
  assert.equal(h.dispatched.length, 1);
  assert.deepEqual(h.notices, [["addToCartSuccess", "success"]]);
});

test("late guest Add responses cannot overwrite a customer login, reset, or another recovered cart", async () => {
  for (const next of [
    { raw: customerBearer, guest: false },
    { raw: proof(41), guest: true },
    null,
  ]) {
    let release;
    const h = harness({ upstream: () => new Promise(resolve => { release = () => resolve(Response.json(success())); }) });
    const pending = h.hook.onAddToCart({ productId: "5", quantity: 1 });
    while (!release) await new Promise(setImmediate);
    for (const key of Object.keys(h.jar.values)) delete h.jar.values[key];
    if (next) Object.assign(h.jar.values, cookieJar(next).values);
    const before = { ...h.jar.values };
    release();
    await pending;
    assert.deepEqual(h.jar.values, before);
    assert.deepEqual(h.jar.writes, []);
    assert.deepEqual(h.dispatched, []);
    assert.deepEqual(h.notices, [["createCartSessionFailed", "danger"]]);
    assert.deepEqual(h.logs, []);
  }
});

test("failed, missing, or contradictory Add responses preserve the old guest proof and do not announce success", async () => {
  for (const response of [{}, { data: { createAddProductInCart: null } }, success({ ...cart, success: false }),
    { ...success(), error: { message: freshProof } }, { ...success(), errors: [{ message: freshProof }] }]) {
    const h = harness({ response });
    const before = { ...h.jar.values };
    await h.hook.onAddToCart({ productId: "5", quantity: 1 });
    assert.deepEqual(h.jar.values, before);
    assert.deepEqual(h.jar.writes, []);
    assert.deepEqual(h.dispatched, []);
    assert.ok(h.notices.every(([, tone]) => tone !== "success"));
    assert.ok(!JSON.stringify(h.notices).includes(freshProof));
    assert.deepEqual(h.logs, []);
  }
});

test("two pending Adds from the same old proof cannot replace the first recovered session with a stale second response", async () => {
  const releases = [];
  const h = harness({ upstream: () => new Promise(resolve => releases.push(resolve)) });
  const first = h.hook.onAddToCart({ productId: "5", quantity: 1 });
  const second = h.hook.onAddToCart({ productId: "6", quantity: 1 });
  while (releases.length !== 2) await new Promise(setImmediate);
  assert.ok(h.requests.every(entry => entry.options.headers.Authorization === `Bearer ${oldProof}`));
  releases[0](Response.json(success()));
  await first;
  const firstCookies = { ...h.jar.values }, writes = h.jar.writes.length;
  releases[1](Response.json(success({ ...cart, id: "30", sessionToken: proof(30) })));
  await second;
  assert.deepEqual(h.jar.values, firstCookies);
  assert.equal(h.jar.writes.length, writes);
  assert.equal(h.cookies.getCartToken(), freshProof);
  assert.equal(h.dispatched.length, 1);
  assert.deepEqual(h.notices, [["addToCartSuccess", "success"], ["createCartSessionFailed", "danger"]]);
  assert.equal(h.requests.length, 2, "No automatic retry, reset, create, or merge");
});

test("HTTP and network failures leave the guest session unchanged and never disclose response proofs", async () => {
  for (const status of [403, 429, 500, 503, null]) {
    const h = harness({ upstream: async () => {
      if (status === null) throw new Error(freshProof);
      return Response.json({ error: freshProof }, { status });
    } });
    const before = { ...h.jar.values };
    await h.hook.onAddToCart({ productId: "5", quantity: 1 });
    assert.deepEqual(h.jar.values, before);
    assert.deepEqual(h.jar.writes, []);
    assert.deepEqual(h.dispatched, []);
    assert.deepEqual(h.notices, [["genericError", "danger"]]);
    assert.deepEqual(h.logs, []);
  }
});

test("numeric IDs, malformed proofs, oversized values and non-guest flags are never persisted as a guest session", async () => {
  const malformed = [
    ...[undefined, null, 29, "29", "", " ", customerBearer, "x".repeat(4097), `${freshProof}\n`].map(sessionToken => ({ ...cart, sessionToken })),
    ...[undefined, null, 0, -1, 1.5, true, "29x", "029", Number.MAX_SAFE_INTEGER + 1].map(id => ({ ...cart, id })),
    ...[undefined, null, 1, "true"].map(isGuest => ({ ...cart, isGuest })),
  ];
  for (const value of malformed) {
    const h = harness({ response: success(value) });
    const before = { ...h.jar.values };
    await h.hook.onAddToCart({ productId: "5", quantity: 1 });
    assert.deepEqual(h.jar.values, before);
    assert.deepEqual(h.jar.writes, []);
    assert.deepEqual(h.dispatched, []);
    assert.ok(h.notices.every(([, tone]) => tone !== "success"));
    assert.deepEqual(h.logs, []);
  }
});

test("an existing valid guest proof remains raw on future requests and is never replaced by cartToken ID", async () => {
  const same = { ...cart, id: "7", cartToken: "7", sessionToken: oldProof };
  const h = harness({ response: success(same) });
  await h.hook.onAddToCart({ productId: "5", quantity: 1 });
  assert.equal(h.cookies.getCartToken(), oldProof);
  assert.notEqual(h.cookies.getCartToken(), same.cartToken);
  assert.equal(h.jar.values.guest_cart_id, "7");
  assert.equal(h.dispatched.length, 1);
});

test("first guest creation still runs only when needed and recovery never invokes reset or creates a second cart", async () => {
  const h = harness({ jar: cookieJar({ raw: null }) });
  await h.hook.onAddToCart({ productId: "5", quantity: 1 });
  assert.deepEqual(h.requests.map(entry => entry.url), ["/api/cart/createGuestToken", "/api/cart/addToCart"]);
  assert.equal(h.cookies.getCartToken(), freshProof);
  assert.equal(h.jar.values.guest_cart_id, "29");
  assert.deepEqual(h.logs, []);
});

test("an opaque/blocked cookie context cannot persist an Add response or throw", () => {
  const h = harness({ jar: cookieJar({ blocked: true }) });
  assert.equal(h.guest.persistGuestCart(cart, oldProof), false);
  assert.deepEqual(h.jar.writes, []);
  assert.deepEqual(h.requests, []);
});

test("a raw proof within 4096 bytes is rejected when its encoded cookie envelope exceeds the browser budget", async () => {
  const largeProof = `${"a".repeat(3900)}.${"f".repeat(64)}`;
  assert.ok(largeProof.length < 4096);
  assert.ok(envelope.encodeJWT({ sessionToken: largeProof, cartId: 29, isGuest: true }).length > 4096);
  const h = harness({ response: success({ ...cart, sessionToken: largeProof }) });
  const before = { ...h.jar.values };
  await h.hook.onAddToCart({ productId: "5", quantity: 1 });
  assert.deepEqual(h.jar.values, before);
  assert.deepEqual(h.jar.writes, []);
  assert.deepEqual(h.dispatched, []);
  assert.deepEqual(h.notices, [["createCartSessionFailed", "danger"]]);
  assert.equal(h.state[0], null);
  assert.equal(h.state[1], null);
});

test("silent or throwing cookie writes do not claim recovery or update hook/Redux state", async () => {
  for (const options of [{ ignoreWrites: true }, { throwWrites: true }]) {
    const h = harness({ jar: cookieJar(options) });
    const before = { ...h.jar.values };
    await h.hook.onAddToCart({ productId: "5", quantity: 1 });
    assert.deepEqual(h.jar.values, before);
    assert.deepEqual(h.jar.writes, []);
    assert.deepEqual(h.dispatched, []);
    assert.deepEqual(h.notices, [["createCartSessionFailed", "danger"]]);
    assert.deepEqual(h.logs, []);
    assert.equal(h.state[0], null);
    assert.equal(h.state[1], null);
    assert.equal(h.cookies.getCartToken(), oldProof);
  }
});

test("the existing Add BFF preserves the server session/tenant authority and never treats a cart ID as the bearer", async () => {
  const calls = [];
  const route = load("src/app/api/cart/addToCart/route.ts", {
    "@/graphql": { CREATE_ADD_PRODUCT_IN_CART: "synthetic-query" },
    "@/utils/server/storefront-unavailable": { storefrontUnavailableResponse: () => null },
    "@/utils/bagisto": { bagistoFetch: async options => { calls.push(options); return { body: success() }; } },
    "@/utils/type-guards": { isBagistoError: () => false },
    "@utils/helper": { getAuthToken: request => request.headers.get("authorization")?.slice(7) },
  }).POST;
  const response = await route(new Request("https://synthetic-tenant-a.test/api/cart/addToCart", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${oldProof}` }, body: JSON.stringify({ productId: 5, quantity: 1 }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), success());
  assert.equal(calls[0].guestToken, oldProof);
  assert.equal(calls[0].cache, "no-store");
  assert.notEqual(calls[0].isCookies, false, "Keep the authoritative server-side customer session lookup enabled");
  assert.deepEqual(calls[0].variables, { cartId: null, productId: 5, quantity: 1 });
});
