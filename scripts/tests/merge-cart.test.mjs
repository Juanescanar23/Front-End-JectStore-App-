import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import apollo from "@apollo/client";
import { MutationObserver, QueryClient } from "@tanstack/query-core";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const { gql } = apollo;
const files = {
  login: "src/components/customer/LoginForm.tsx",
  hook: "src/utils/hooks/useMergeCart.ts",
  route: "src/app/api/cart/mergeCart/route.ts",
  query: "src/graphql/cart/mutations/CreateMergeCart.ts",
};
const customerToken = "synthetic-customer-bearer-only";
const guestCartToken = "synthetic-guest-proof-only";
const message = "No se pudo unir el carrito. Intenta de nuevo.";
const constants = { GUEST_CART_ID: "guest_cart_id", GUEST_CART_TOKEN: "guest_cart_token", IS_GUEST: "is_guest" };
const cart = { id: "29", items: { edges: [] }, subtotal: 10, grandTotal: 10 };
const success = { data: { createMergeCart: { mergeCart: cart } } };

function load(file, dependencies = {}, globals = {}) {
  const output = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const fixtureModule = { exports: {} };
  new Function(...Object.keys(globals), "require", "module", "exports", output)(
    ...Object.values(globals),
    (id) => { assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`); return dependencies[id]; },
    fixtureModule, fixtureModule.exports,
  );
  return fixtureModule.exports;
}

const { CREATE_MERGE_CART } = load(files.query, { "@apollo/client": { gql } });

function routeHarness(upstream = async () => ({ body: success })) {
  const calls = [];
  const handler = load(files.route, {
    "@/graphql": { CREATE_MERGE_CART },
    "@/utils/server/storefront-unavailable": { storefrontUnavailableResponse: (error) => error?.transportResponse ?? null },
    "@/utils/bagisto": { bagistoFetch: async (options) => { calls.push(options); return upstream(options); } },
    "@/utils/type-guards": { isBagistoError: (error) => Boolean(error?.graphql) },
    "@/utils/helper": { getAuthToken: (request) => request.headers.get("Authorization")?.split(" ")[1] },
  }).POST;
  const send = (body) => handler(new Request("https://tenant-a.test/api/cart/mergeCart", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${customerToken}` }, body: JSON.stringify(body),
  }));
  return { calls, send };
}

test("merge GraphQL keeps its customer operation and adds only the optional guest proof input", () => {
  const operation = CREATE_MERGE_CART.definitions[0];
  const variables = operation.variableDefinitions;
  assert.equal(variables.find((entry) => entry.variable.name.value === "cartId").type.kind, "NonNullType");
  const proof = variables.find((entry) => entry.variable.name.value === "guestCartToken");
  assert.equal(proof?.type.kind, "NamedType");
  assert.equal(proof?.type.name.value, "String");
  const input = operation.selectionSet.selections[0].arguments[0].value.fields;
  assert.deepEqual(input.map((field) => [field.name.value, field.value.name.value]), [["cartId", "cartId"], ["guestCartToken", "guestCartToken"]]);
  assert.doesNotMatch(CREATE_MERGE_CART.loc.source.body, /accessToken|customerToken|Authorization/);
});

test("actual merge route sends bounded raw proof only in variables and retains the customer bearer fallback", async () => {
  for (const proof of [guestCartToken, "a".repeat(4096)]) {
    const h = routeHarness();
    const response = await h.send({ cartId: 17, guestCartToken: proof });
    assert.equal(response.status, 200);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.calls[0].variables, { cartId: 17, guestCartToken: proof });
    assert.equal(h.calls[0].guestToken, customerToken, "The legacy wrapper option holds only the customer bearer, never guest proof");
    assert.notEqual(h.calls[0].isCookies, false, "Keep the authoritative server session lookup enabled");
    assert.equal(h.calls[0].cache, "no-store");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), success);
  }
});

test("actual route and GraphQL wrapper keep the verified customer session bearer, never the guest proof", async () => {
  const sent = [], sessionHosts = [];
  const sessionToken = "synthetic-verified-customer-session";
  const requestHeaders = new Headers({ host: "tenant-a.test" });
  const bagisto = load("src/utils/bagisto/index.ts", {
    "next/headers": { cookies: async () => ({ get: () => undefined }) },
    "next/server": {},
    "@/utils/server/client-context": {
      optionalRequestHeaders: async () => requestHeaders, clientContextHost: (headers) => headers.get("host"),
      clientContextFetch: () => async (url, options) => { sent.push({ url, options }); return Response.json(success); },
    },
    "@/utils/server/storefront-http-error": { assertStorefrontHttpResponse: (response) => assert.equal(response.ok, true) },
    "../constants": { STOREFRONT_KEY: "", BAGISTO_SESSION: "fixture-session" },
    "next-auth": { getServerSession: async (options) => { sessionHosts.push(options.host); return { user: { accessToken: sessionToken } }; } },
    "@/graphql/customer/mutations": {}, "@/graphql": {}, "@/graphql/theme/mutations": {},
    "@/utils/constants": { GRAPHQL_URL: "/graphql" },
    "@utils/auth": { createTenantAuthOptions: (host) => ({ host }) },
    "@/utils/request-host": { requestHost: (headers) => headers.get("host") },
    "@/utils/server/storefront-locale": { getStorefrontLocaleCode: async () => "es" },
    "@/utils/graphql-endpoint": {
      resolveServerGraphqlUrl: () => "http://127.0.0.1:9/graphql",
      buildTenantForwardHeaders: (host) => ({ "x-tenant-host": host }),
    },
  });
  const h = routeHarness((options) => bagisto.bagistoFetch(options));
  assert.equal((await h.send({ cartId: 17, guestCartToken })).status, 200);
  assert.deepEqual(sessionHosts, ["tenant-a.test"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].options.headers.Authorization, `Bearer ${sessionToken}`);
  assert.equal(JSON.stringify(sent[0].options.headers).includes(guestCartToken), false);
  assert.deepEqual(JSON.parse(sent[0].options.body).variables, { cartId: 17, guestCartToken });
});

test("actual merge route rejects missing/invalid proofs and unsigned IDs before any upstream request", async () => {
  const invalid = [null, [], {}, { cartId: 17 }, ...[null, false, 1, {}, [], "", "  ", "a".repeat(4097), "é".repeat(2049)].map((proof) => ({ cartId: 17, guestCartToken: proof })),
    ...[null, "17", true, -1, 0, 1.5, 2147483648].map((cartId) => ({ cartId, guestCartToken }))];
  for (const body of invalid) {
    const h = routeHarness();
    const response = await h.send(body);
    assert.equal(response.status, 400);
    assert.equal(h.calls.length, 0);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { message });
  }
});

test("actual merge route never echoes proof-bearing upstream errors and retains typed transport status", async () => {
  for (const error of [Object.assign(new Error(guestCartToken), { graphql: true, cause: { token: customerToken } }), new Error(customerToken)]) {
    const h = routeHarness(async () => { throw error; });
    const response = await h.send({ cartId: 17, guestCartToken });
    assert.equal(response.status, error.graphql ? 200 : 500);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const text = await response.text();
    assert.ok(text.includes(message));
    assert.ok(!text.includes(customerToken) && !text.includes(guestCartToken));
  }
  const transportResponse = Response.json({ message: "Unavailable fixture" }, { status: 503 });
  const h = routeHarness(async () => { throw { transportResponse }; });
  assert.equal(await h.send({ cartId: 17, guestCartToken }), transportResponse);
});

function cookieJar(initial = {}) {
  const values = { ...initial };
  const writes = [];
  const document = {
    get cookie() { return Object.entries(values).map(([name, value]) => `${name}=${value}`).join("; "); },
    set cookie(value) { const pair = value.split(";")[0]; const i = pair.indexOf("="); values[pair.slice(0, i)] = pair.slice(i + 1); writes.push(value); },
  };
  return { document, values, writes };
}

function hookHarness({ response = success, failure = null, jar = cookieJar() } = {}) {
  const requests = [], dispatched = [], notices = [];
  const api = load(files.hook, {
    "@tanstack/react-query": { useMutation: (options) => {
      const observer = new MutationObserver(new QueryClient({ defaultOptions: { mutations: { retry: false } } }), options);
      return { mutateAsync: (variables) => observer.mutate(variables), isPending: false, error: null };
    } },
    "./useToast": { useCustomToast: () => ({ showToast: (...args) => notices.push(args) }) },
    "@/store/hooks": { useAppDispatch: () => (action) => dispatched.push(action) },
    "../fetch-handler": { fetchHandler: async (options) => { requests.push(options); if (failure) throw failure; return response; } },
    "@/store/slices/cart-slice": { addItem: (value) => ({ type: "fixture/cart", payload: value }) },
  }, { window: {}, document: jar.document }).useMergeCart();
  return { api, requests, dispatched, notices, jar };
}

test("real mutation lifecycle sends dual proofs separately and updates the cart only after a validated ID", async () => {
  const h = hookHarness();
  assert.equal(await h.api.mergeCart(customerToken, 17, guestCartToken), success);
  assert.deepEqual(h.requests[0].body, { cartId: 17, guestCartToken });
  assert.equal(h.requests[0].headers.Authorization, `Bearer ${customerToken}`);
  assert.equal(h.dispatched.length, 1);
  assert.equal(h.dispatched[0].payload, cart);
  assert.equal(h.jar.values.guest_cart_id, "29");
  assert.deepEqual(h.notices, []);
});

test("real mutation lifecycle rejects errors/null/malformed success without cookie writes or cart dispatch", async () => {
  const results = [{}, { error: { message: guestCartToken } }, { data: { createMergeCart: null } },
    ...[null, false, "", "0", "17x", -1, 0, 1.5, true, {}, Number.MAX_SAFE_INTEGER + 1].map((id) => ({ data: { createMergeCart: { mergeCart: { ...cart, id } } } })),
    { ...success, errors: [{ message: customerToken }] }, { ...success, error: { message: guestCartToken } }];
  for (const response of results) {
    const h = hookHarness({ response });
    await assert.rejects(h.api.mergeCart(customerToken, 17, guestCartToken), { message });
    assert.deepEqual(h.jar.writes, []);
    assert.deepEqual(h.dispatched, []);
    assert.deepEqual(h.notices, [[message, "danger"]]);
  }
  const h = hookHarness({ failure: new Error(guestCartToken) });
  await assert.rejects(h.api.mergeCart(customerToken, 17, guestCartToken), { message });
  assert.deepEqual(h.notices, [[message, "danger"]]);
});

function loginHandler(scope) {
  const source = ts.createSourceFile(files.login, readFileSync(path.join(root, files.login), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  const visit = (node) => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === "onSubmit") handler = node.initializer; ts.forEachChild(node, visit); };
  visit(source);
  assert.ok(handler && ts.isArrowFunction(handler));
  const output = ts.transpileModule(`return ${handler.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), output)(...Object.values(scope));
}

function loginHarness({ guest = true, withCart = true, response = success, failure = null, loginOk = true } = {}) {
  const { encodeJWT, decodeJWT } = load("src/utils/jwt-cookie.ts");
  const jar = cookieJar(withCart ? { guest_cart_id: "17", guest_cart_token: encodeJWT({ sessionToken: guestCartToken, cartId: 17, isGuest: true }), is_guest: String(guest) } : {});
  const cookieApi = load("src/utils/getCartToken.ts", { "@/utils/constants": constants, "@/utils/jwt-cookie": { decodeJWT } }, { document: jar.document });
  const hook = hookHarness({ response, failure, jar });
  const events = [], notices = [], navigation = [], logs = [];
  let signedIn = false;
  const handler = loginHandler({
    ...constants,
    getCookie: cookieApi.getCookie,
    getCartToken: () => { assert.equal(signedIn, false, "Guest proof must be captured before signIn can change auth state"); events.push("proof"); return cookieApi.getCartToken(); },
    signIn: async () => { events.push("sign-in"); signedIn = true; return { ok: loginOk }; },
    getSession: async () => ({ user: { accessToken: customerToken, id: "fixture-customer" } }),
    mergeCart: (...args) => hook.api.mergeCart(...args),
    setCookie: (name, value) => { jar.document.cookie = `${name}=${encodeURIComponent(value)};path=/`; },
    showToast: (...args) => notices.push(args), setLocalStorage() {}, dispatch() {}, setUser: (value) => value,
    getCartDetail: async () => events.push("read-cart"),
    setTimeout: (callback) => callback(), router: { push: (value) => navigation.push(value), refresh() {} },
    console: { warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  });
  return { handler, jar, hook, events, notices, navigation, logs };
}

test("actual login handler captures the raw guest JWT before sign-in and switches cookies only on confirmed merge", async () => {
  const h = loginHarness();
  await h.handler({ username: "qa@example.invalid", password: "synthetic-only" });
  assert.deepEqual(h.events, ["proof", "sign-in", "read-cart"]);
  assert.deepEqual(h.hook.requests[0].body, { cartId: 17, guestCartToken });
  assert.equal(h.jar.values.guest_cart_token, customerToken);
  assert.equal(h.jar.values.is_guest, "false");
  assert.equal(h.jar.values.guest_cart_id, "29");
  assert.deepEqual(h.logs, []);
  assert.deepEqual(h.navigation, ["/"]);
});

test("actual login retains guest proof, ID and flag on merge failure without logging or false cart dispatch", async () => {
  for (const options of [{ response: { data: { createMergeCart: null } } }, { failure: new Error(guestCartToken) }]) {
    const h = loginHarness(options);
    const before = { ...h.jar.values };
    await h.handler({ username: "qa@example.invalid", password: "synthetic-only" });
    assert.deepEqual(h.jar.values, before);
    assert.deepEqual(h.jar.writes, []);
    assert.deepEqual(h.hook.dispatched, []);
    assert.deepEqual(h.logs, []);
    assert.ok(!h.events.includes("read-cart"));
  }
});

test("actual login never adopts an unsigned ID, merges a customer cart, or changes a cart after failed login", async () => {
  const missingProof = loginHarness();
  delete missingProof.jar.values.guest_cart_token;
  const before = { ...missingProof.jar.values };
  await missingProof.handler({ username: "qa@example.invalid", password: "synthetic-only" });
  assert.deepEqual(missingProof.hook.requests, []);
  assert.deepEqual(missingProof.jar.values, before);
  assert.ok(missingProof.notices.some(([text]) => text === message));
  for (const options of [{ guest: false }, { withCart: false }]) {
    const h = loginHarness(options);
    await h.handler({ username: "qa@example.invalid", password: "synthetic-only" });
    assert.deepEqual(h.hook.requests, []);
    assert.equal(h.jar.values.guest_cart_token, customerToken);
    assert.equal(h.jar.values.is_guest, "false");
  }
  const denied = loginHarness({ loginOk: false });
  await denied.handler({ username: "qa@example.invalid", password: "synthetic-only" });
  assert.deepEqual(denied.hook.requests, []);
  assert.deepEqual(denied.jar.writes, []);
  assert.deepEqual(denied.navigation, []);
});
