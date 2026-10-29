import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");

function loader(mocks = {}) {
  const cache = new Map();
  return function load(relative) {
    const source = resolve(root, relative);
    const file = [source, `${source}.ts`, `${source}.tsx`].find(existsSync);
    assert.ok(file, `Missing source ${relative}`);
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const localRequire = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.endsWith(".css")) return {};
      if (name.startsWith(".")) return load(resolve(dirname(file), name));
      if (name.startsWith("@/")) return load(`src/${name.slice(2)}`);
      return require(name);
    };
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  };
}

// Deterministic hook/event driver. The providers and NextAuth implementation
// below are real source, not a substitute for NextAuth's lifecycle logic.
// This is not a browser/CUA test and deliberately makes no network requests.
function sessionHarness(t) {
  const effects = [], cleanups = [], contexts = new Map(), mounts = [], requests = [], intervals = new Map();
  const listeners = () => {
    const entries = new Map();
    return {
      addEventListener(name, callback) { const callbacks = entries.get(name) ?? new Set(); callbacks.add(callback); entries.set(name, callbacks); },
      removeEventListener(name, callback) { entries.get(name)?.delete(callback); },
      dispatch(name, event = {}) { for (const callback of entries.get(name) ?? []) callback(event); },
      count(name) { return entries.get(name)?.size ?? 0; },
    };
  };
  const window = { ...listeners(), location: { href: "https://tenant.test/__storefront-next-preview" } };
  const document = { ...listeners(), visibilityState: "visible" };
  let cookieReads = 0, storageAccesses = 0;
  Object.defineProperty(document, "cookie", { get() { cookieReads++; throw new DOMException("Opaque preview", "SecurityError"); }, set() { assert.fail("Must not write preview cookies"); } });
  const globals = {
    window, document, navigator: { onLine: true },
    localStorage: { setItem() { storageAccesses++; throw new DOMException("Opaque preview", "SecurityError"); } },
    fetch: async (...args) => { requests.push(args); return Response.json({ user: { name: "Synthetic session" }, expires: "2099-01-01T00:00:00Z" }); },
    setInterval: (callback) => { const id = intervals.size + 1; intervals.set(id, callback); return id; },
    clearInterval: (id) => intervals.delete(id),
  };
  const saved = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const hooks = {
    ...React,
    useState: initial => [typeof initial === "function" ? initial() : initial, () => {}],
    useRef: initial => ({ current: initial }),
    useMemo: callback => callback(),
    useEffect: effect => effects.push(effect),
    useContext: context => contexts.has(context) ? contexts.get(context) : context._currentValue,
  };
  const authFile = require.resolve("next-auth/react");
  const authModule = { exports: {} };
  const authRequire = createRequire(authFile);
  new Function("require", "module", "exports", readFileSync(authFile, "utf8"))(
    name => name === "react" ? hooks : authRequire(name), authModule, authModule.exports,
  );
  const auth = authModule.exports;
  const load = loader({ react: hooks, "next-auth/react": auth });
  const mount = element => {
    if (!element || typeof element === "string" || typeof element === "number") return;
    if (Array.isArray(element)) { element.forEach(mount); return; }
    const { type, props } = element;
    if (typeof type === "function") { mounts.push({ type, props }); mount(type(props)); return; }
    if (type?.$$typeof === Symbol.for("react.context") || type?.$$typeof === Symbol.for("react.provider")) {
      const context = type._context ?? type;
      const present = contexts.has(context), previous = contexts.get(context);
      contexts.set(context, props.value);
      mount(props.children);
      if (present) contexts.set(context, previous); else contexts.delete(context);
      return;
    }
    mount(props?.children);
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const flush = async () => {
    for (const effect of effects.splice(0).reverse()) { const cleanup = effect(); if (typeof cleanup === "function") cleanups.push(cleanup); }
    await settle(); await settle();
  };
  t.after(() => {
    cleanups.reverse().forEach(cleanup => cleanup());
    for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  });
  return { auth, hooks, load, mount, flush, settle, window, document, intervals, mounts, requests,
    reads: () => ({ cookieReads, storageAccesses }) };
}

test("installed NextAuth provider really fetches on initial mount, focus and storage", async t => {
  const h = sessionHarness(t);
  h.mount(React.createElement(h.auth.SessionProvider, null, "public"));
  await h.flush();
  assert.equal(h.requests.length, 1);
  h.document.dispatch("visibilitychange"); await h.settle();
  assert.equal(h.requests.length, 2);
  h.window.dispatch("storage", { key: "nextauth.message", newValue: JSON.stringify({ event: "session", data: { trigger: "signIn" } }) });
  await h.settle();
  assert.equal(h.requests.length, 3);
  assert.equal(h.intervals.size, 0, "Default public polling remains disabled");
});

test("null session and disabled focus alone still allow NextAuth storage refetch", async t => {
  const h = sessionHarness(t);
  h.mount(React.createElement(h.auth.SessionProvider, { session: null, refetchOnWindowFocus: false, refetchInterval: 0 }, "preview"));
  await h.flush();
  h.document.dispatch("visibilitychange"); await h.settle();
  assert.equal(h.requests.length, 0);
  h.window.dispatch("storage", { key: "nextauth.message", newValue: JSON.stringify({ event: "session", data: { trigger: "signIn" } }) });
  await h.settle();
  assert.equal(h.requests.length, 1, "Regression canary for the installed library, not a mock assertion");
});

test("actual nested preview providers are inert for mount, update, focus, storage and polling", async t => {
  const h = sessionHarness(t);
  const { SessionProvider } = h.load("src/providers/SessionProvider.tsx");
  const { NextAuthProvider } = h.load("src/providers/NextAuthProvider.tsx");
  let session;
  function Consumer() { session = h.auth.useSession(); return null; }
  h.mount(React.createElement(SessionProvider, { readonlyPreview: true }, React.createElement(NextAuthProvider, null, React.createElement(Consumer))));
  await h.flush();
  assert.equal(h.mounts.filter(entry => entry.type === h.auth.SessionProvider).length, 0);
  assert.equal(session.data, null);
  assert.equal(session.status, "unauthenticated");
  assert.equal(await session.update({ user: { name: "Cannot create a preview session" } }), null);
  h.document.dispatch("visibilitychange");
  h.window.dispatch("storage", { key: "nextauth.message", newValue: JSON.stringify({ event: "session", data: { trigger: "signIn" } }) });
  for (const tick of h.intervals.values()) tick();
  await h.settle();
  assert.equal(h.requests.length, 0);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.window.count("storage"), 0);
  assert.equal(h.document.count("visibilitychange"), 0);
  assert.deepEqual(h.reads(), { cookieReads: 0, storageAccesses: 0 });
});

test("public providers retain both NextAuth instances with unchanged props and fetching", async t => {
  const h = sessionHarness(t);
  const { SessionProvider } = h.load("src/providers/SessionProvider.tsx");
  const { NextAuthProvider } = h.load("src/providers/NextAuthProvider.tsx");
  h.mount(React.createElement(SessionProvider, { readonlyPreview: false }, React.createElement(NextAuthProvider, null, "public")));
  await h.flush();
  const providers = h.mounts.filter(entry => entry.type === h.auth.SessionProvider);
  assert.equal(providers.length, 2);
  for (const { props } of providers) assert.deepEqual(Object.keys(props), ["children"]);
  assert.ok(h.requests.length >= 1);
  const previous = h.requests.length;
  h.document.dispatch("visibilitychange"); await h.settle();
  assert.ok(h.requests.length > previous);
});

test("opaque preview cart hooks keep read queries disabled and do not create a guest cart on mount", async t => {
  const h = sessionHarness(t);
  const constants = { GUEST_CART_TOKEN: "guest_cart_token", GUEST_CART_ID: "guest_cart_id", IS_GUEST: "isGuest" };
  const cookies = loader({ "@/utils/constants": constants })("src/utils/getCartToken.ts");
  const queries = [];
  const fetchHandler = () => assert.fail("Mounting this preview must not request or mutate a cart");
  const load = loader({
    react: h.hooks,
    "@/utils/constants": constants,
    "@tanstack/react-query": { useQuery: options => { queries.push(options); return { data: null, isLoading: false, refetch: fetchHandler }; } },
    "@/store/hooks": { useAppDispatch: () => () => assert.fail("No cart data should be dispatched") },
    "@/store/slices/cart-slice": { addItem: value => value },
    "@utils/type-guards": { isObject: value => value !== null && typeof value === "object" },
    "@utils/cart/normalize": { resolveReadCartPayload: () => null },
    "@utils/getCartToken": cookies,
    "./getCartToken": cookies,
    "../getCartToken": cookies,
    "./fetch-handler": { fetchHandler },
    "../fetch-handler": { fetchHandler },
  });
  load("src/utils/hooks/useCartDetail.ts").useCartDetail();
  load("src/utils/useAddress.ts").useAddress();
  const guest = load("src/utils/hooks/useGuestCartToken.ts").useGuestCartToken();
  await h.flush();
  assert.equal(queries.length, 2);
  assert.ok(queries.every(query => query.enabled === false));
  assert.equal(guest.token, null);
  assert.equal(guest.cartId, null);
  assert.equal(h.requests.length, 0);
  assert.ok(h.reads().cookieReads >= 3);
  assert.equal(h.reads().storageAccesses, 0);
});

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

async function layoutFor(headers) {
  const markers = { AppWrapper: () => null, ReduxProvider: () => null, ThemeProvider: () => null, ToastProvider: () => null, SessionProvider: () => null };
  const SpeculationRules = () => null;
  const load = loader({
    "@/providers": markers,
    "next/font/google": { Outfit: () => ({ variable: "fixture-font" }) },
    "next/headers": { headers: async () => headers },
    "@utils/helper": { generateMetadataForPage: () => ({}) },
    "@utils/metadata": { staticSeo: { default: {} } },
    "@/providers/ReactQueryProvider": { ReactQueryProvider: () => null },
    "@components/theme/SpeculationRules": { SpeculationRules },
    "@/app/portal/PortalShell": { default: () => null, __esModule: true },
    "@/utils/server/request-base-url": { getRequestBaseUrl: async () => null },
    "@/utils/server/storefront-seo": { getStorefrontSeoPayload: async () => null },
    "@/utils/server/storefront-locale": { getStorefrontLocaleCode: async () => "es" },
  });
  const tree = await load("src/app/layout.tsx").default({ children: "page" });
  return { all: nodes(tree), markers, SpeculationRules };
}

test("root preview disables both speculation sources and explicitly selects readonly session", async () => {
  const { all, markers, SpeculationRules } = await layoutFor(new Headers({ host: "tenant.test", "x-jectstore-next-preview-query": "validated-proxy-query" }));
  assert.equal(all.find(node => node.type === markers.SessionProvider).props.readonlyPreview, true);
  assert.equal(all.filter(node => node.type === "script" && node.props.type === "speculationrules").length, 0);
  assert.equal(all.filter(node => node.type === SpeculationRules).length, 0);
});

test("public root preserves speculation and client session behavior", async () => {
  const { all, markers, SpeculationRules } = await layoutFor(new Headers({ host: "tenant.test" }));
  assert.equal(all.find(node => node.type === markers.SessionProvider).props.readonlyPreview, false);
  assert.equal(all.filter(node => node.type === "script" && node.props.type === "speculationrules").length, 1);
  assert.equal(all.filter(node => node.type === SpeculationRules).length, 1);
});

test("real proxy strips client preview claims and supplies the marker only on its scoped preview path", async t => {
  const names = ["STOREFRONT_EXPERIENCES_ENABLED", "STOREFRONT_EXPERIENCE_HOSTS", "STOREFRONT_RUNTIME_SIGNING_KEY"];
  const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => { for (const [name, value] of Object.entries(old)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  Object.assign(process.env, { STOREFRONT_EXPERIENCES_ENABLED: "true", STOREFRONT_EXPERIENCE_HOSTS: "tenant.test", STOREFRONT_RUNTIME_SIGNING_KEY: "synthetic-preview-test-key-not-a-secret" });
  const load = loader({ "next-auth/jwt": { getToken: async () => null } });
  const runtime = load("src/lib/storefront-experience/runtime.ts");
  const { NextRequest } = require("next/server");
  const { proxy } = load("src/proxy.ts");
  const query = "tenant=fixture&host=tenant.test&channel=1&locale=es&page=7&version=2&actor=1&session=fixture&expires=1793062800&signature=fixture&_editor_preview=fixture";
  const preview = await proxy(new NextRequest(`https://tenant.test${runtime.PREVIEW_PATH}?${query}`, { headers: { host: "tenant.test", [runtime.PREVIEW_QUERY_HEADER]: "forged" } }));
  assert.equal(preview.headers.get(`x-middleware-request-${runtime.PREVIEW_QUERY_HEADER}`), query);
  process.env.STOREFRONT_EXPERIENCES_ENABLED = "false";
  const publicResponse = await proxy(new NextRequest("https://tenant.test/", { headers: { host: "tenant.test", [runtime.PREVIEW_QUERY_HEADER]: query } }));
  assert.equal(publicResponse.headers.get(`x-middleware-request-${runtime.PREVIEW_QUERY_HEADER}`), null);
  const sanitized = runtime.safeRequestHeaders(new Headers({ host: "tenant.test", [runtime.PREVIEW_QUERY_HEADER]: query }), "tenant.test", "https:");
  const { all, markers } = await layoutFor(sanitized);
  assert.equal(all.find(node => node.type === markers.SessionProvider).props.readonlyPreview, false);
});
