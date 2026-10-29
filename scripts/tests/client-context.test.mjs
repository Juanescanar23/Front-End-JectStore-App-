import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");
const fixture = JSON.parse(readFileSync(new URL("./fixtures/trusted-client-ip-v1.json", import.meta.url), "utf8"));
const ENDPOINT = "https://app.jectstore.test/graphql";
const DOMAIN = "jectstore.client-context.v1\n";
const HEADER = "X-JectStore-Client-Context";
const constants = { GRAPHQL_URL: "/graphql", STOREFRONT_KEY: "public-fixture-key", BAGISTO_SESSION: "cart_fixture" };
const source = (file) => readFileSync(resolve(root, file), "utf8");

function loader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    const path = resolve(root, relative);
    const file = [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`].find(candidate => existsSync(candidate) && statSync(candidate).isFile());
    assert.ok(file, `Missing source ${relative}`);
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const localRequire = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith(".")) return load(resolve(dirname(file), name));
      if (name.startsWith("@/")) return load(`src/${name.slice(2)}`);
      if (name.startsWith("@utils/")) return load(`src/utils/${name.slice(7)}`);
      return require(name);
    };
    new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  }
  return load;
}

function environment(t, values = {}) {
  const settings = {
    NODE_ENV: "production", STOREFRONT_REALTIME_MODE: "false", STOREFRONT_EXPERIENCES_ENABLED: "false",
    STOREFRONT_RUNTIME_SIGNING_KEY: fixture.key, BAGISTO_SERVER_ENDPOINT: "https://app.jectstore.test", STOREFRONT_BACKEND_ORIGIN: undefined,
    NEXT_PUBLIC_LANDLORD_HOST: "app.jectstore.test", ...values,
  };
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

function incoming(ip = "203.0.113.10", host = "tenant-a.test") {
  return new Headers({ host, "X-Jectstore-Client-IP": ip, "x-forwarded-for": "192.0.2.99", "x-real-ip": "192.0.2.98" });
}

function verify(init, key = fixture.key) {
  const value = new Headers(init.headers).get(HEADER);
  assert.match(value, /^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/);
  const [payload, signature] = value.split(".");
  assert.equal(signature, createHmac("sha256", key).update(DOMAIN + payload).digest("hex"));
  const json = Buffer.from(payload, "base64url").toString("utf8");
  const claims = JSON.parse(json);
  assert.equal(JSON.stringify(claims), json);
  assert.deepEqual(Object.keys(claims).sort(), ["body_sha256", "expires_at", "host", "ip", "issued_at", "method", "path", "v"]);
  assert.equal(claims.body_sha256, createHash("sha256").update(init.body, "utf8").digest("hex"));
  assert.equal(claims.method, "POST");
  assert.equal(claims.path, "/graphql");
  assert.equal(claims.v, 1);
  assert.equal(claims.expires_at - claims.issued_at, 60);
  assert.equal(init.cache, "no-store");
  assert.equal(init.redirect, "error");
  assert.deepEqual(init.next, { revalidate: 0 });
  return claims;
}

function harness(t, { withoutRequest = false, configuredUrl = "/graphql", headersError } = {}) {
  environment(t);
  let current = incoming();
  let insideCache = false;
  let headersReads = 0;
  let cookiesReads = 0;
  const requests = [];
  const cacheCalls = [];
  const results = new Map();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return Response.json({ data: { viewer: { id: "public-catalog" }, ping: "ok" } });
  };
  t.after(() => { globalThis.fetch = oldFetch; });
  const load = loader({
    "next/headers": {
      headers: async () => {
        assert.equal(insideCache, false, "headers() must not run inside unstable_cache");
        headersReads++;
        if (headersError) throw headersError;
        if (withoutRequest) throw new Error("`headers` was called outside a request scope. Read more: next");
        return current;
      },
      cookies: async () => { cookiesReads++; return { get: () => undefined }; },
    },
    "next/cache": {
      unstable_cache: (callback, keys, options) => {
        cacheCalls.push({ keys, options });
        return async () => {
          const key = JSON.stringify(keys);
          if (results.has(key)) return results.get(key);
          insideCache = true;
          try { const result = await callback(); results.set(key, result); return result; }
          finally { insideCache = false; }
        };
      },
    },
    "@/utils/constants": { ...constants, GRAPHQL_URL: configuredUrl },
    "../constants": { ...constants, GRAPHQL_URL: configuredUrl },
    "next-auth/react": { getSession: async () => null },
    "next-auth": { getServerSession: async () => null },
    "@utils/auth": { createTenantAuthOptions: () => ({}) },
    "@/graphql/customer/mutations": {}, "@/graphql/theme/mutations": {}, "@/graphql": {},
    "@/utils/server/storefront-locale": { getStorefrontLocaleCode: async () => "es" },
  });
  return { load, requests, cacheCalls, setHeaders: value => { current = value; }, reads: () => ({ headersReads, cookiesReads }) };
}

test("PHP fixture and Node signer produce the exact same compact proof", async (t) => {
  environment(t);
  t.mock.method(Date, "now", () => fixture.claims.issued_at * 1000);
  const { clientContextFetch } = loader()("src/utils/server/client-context.ts");
  const send = clientContextFetch(ENDPOINT, incoming(), async (_url, init) => {
    assert.equal(new Headers(init.headers).get(HEADER), fixture.proof);
    assert.deepEqual(verify(init), fixture.claims);
    return Response.json({});
  });
  await send(ENDPOINT, { method: "POST", body: fixture.body });
});

test("exact UTF-8 body, immutable request context and fresh send-time TTL", async (t) => {
  environment(t);
  let now = fixture.now;
  t.mock.method(Date, "now", () => now * 1000);
  const { clientContextFetch } = loader()("src/utils/server/client-context.ts");
  const headers = incoming("2001:db8::a", "TENANT-A.TEST.:8089");
  const bodies = [JSON.stringify({ query: "query { ping }", variables: { text: "Bogotá 🛍️\n" } }), fixture.body];
  const claims = [];
  const send = clientContextFetch(ENDPOINT, headers, async (_url, init) => { claims.push(verify(init)); return Response.json({}); });
  headers.set("host", "tenant-b.test"); headers.set("X-Jectstore-Client-IP", "203.0.113.20");
  await send(ENDPOINT, { method: "POST", body: bodies[0] });
  now += 120;
  await send(ENDPOINT, { method: "POST", body: bodies[1] });
  assert.equal(claims[0].host, "tenant-a.test"); assert.equal(claims[0].ip, "2001:db8::a");
  assert.equal(claims[1].host, "tenant-a.test"); assert.equal(claims[1].issued_at - claims[0].issued_at, 120);
  assert.notEqual(claims[0].body_sha256, claims[1].body_sha256);
});

test("active request rejects missing or invalid trusted context without disclosing it", (t) => {
  environment(t);
  const { clientContextFetch } = loader()("src/utils/server/client-context.ts");
  const contexts = [new Headers(), new Headers({ host: "tenant-a.test", "x-forwarded-for": "203.0.113.10" }),
    ...["203.0.113.1, 203.0.113.2", "::1%lo0", "999.0.0.1", "user-ip", "", "2001:db8:::1"].map(ip => incoming(ip)),
    ...["", "a.test,b.test", "a.test/path", "a.test:0", "a.test:65536", "user@a.test", "127.0.0.1", "[::1]"].map(host => incoming("203.0.113.1", host)),
    { get: name => name.toLowerCase() === "host" ? "tenant-a.test" : " 203.0.113.1 " }];
  for (const context of contexts) assert.throws(() => clientContextFetch(ENDPOINT, context), error => {
    assert.equal(error.status, 503); assert.equal(error.message, "No pudimos conectar con la tienda. Vuelve a intentarlo."); return true;
  });
  for (const key of ["", "x".repeat(31), "á".repeat(15)]) {
    process.env.STOREFRONT_RUNTIME_SIGNING_KEY = key;
    assert.throws(() => clientContextFetch(ENDPOINT, incoming()), { status: 503 });
  }
  process.env.STOREFRONT_RUNTIME_SIGNING_KEY = "á".repeat(16);
  assert.doesNotThrow(() => clientContextFetch(ENDPOINT, incoming("::ffff:203.0.113.1")));
});

test("transport strips attacker proof/IP and refuses another method, body or destination", async (t) => {
  environment(t);
  const { clientContextFetch } = loader()("src/utils/server/client-context.ts");
  let calls = 0;
  const send = clientContextFetch(ENDPOINT, incoming(), async (_url, init) => {
    calls++; verify(init);
    for (const name of ["x-forwarded-for", "x-real-ip", "forwarded", "x-jectstore-client-ip", "x-jectstore-client-proof"]) assert.equal(init.headers.has(name), false);
    assert.equal(init.headers.get("authorization"), "Bearer synthetic-test-only");
    return Response.json({});
  });
  await send(ENDPOINT, { method: "POST", body: fixture.body, cache: "force-cache", redirect: "follow", next: { tags: ["private"], revalidate: 600 }, headers: {
    [HEADER]: "forged", "x-jectstore-client-proof": "forged", "x-jectstore-client-ip": "192.0.2.9", "x-forwarded-for": "192.0.2.9", "x-real-ip": "192.0.2.8", forwarded: "for=192.0.2.7", authorization: "Bearer synthetic-test-only",
  } });
  for (const url of ["https://other.test/graphql", `${ENDPOINT}?q=x`, `${ENDPOINT}#fragment`, ENDPOINT.replace("graphql", "admin/login"), "/graphql", "https://user:password@app.jectstore.test/graphql"]) {
    await assert.rejects(send(url, { method: "POST", body: fixture.body }), { status: 503 });
  }
  for (const init of [{ method: "GET", body: fixture.body }, { method: "POST", body: new Uint8Array([1]) }, { body: fixture.body }]) await assert.rejects(send(ENDPOINT, init), { status: 503 });
  assert.equal(calls, 1);
});

test("only genuine no-request/build-time context omits proof; rendering/cache errors propagate", async (t) => {
  environment(t, { STOREFRONT_RUNTIME_SIGNING_KEY: undefined });
  for (const message of ["`headers` was called outside a request scope. Read more: next", "Route /x used `headers()` inside `generateStaticParams`. This is not supported because `generateStaticParams` runs at build time without an HTTP request."]) {
    const { optionalRequestHeaders, clientContextFetch } = loader({ "next/headers": { headers: async () => { throw new Error(message); } } })("src/utils/server/client-context.ts");
    assert.equal(await optionalRequestHeaders(), null);
    await clientContextFetch(ENDPOINT, null, async (_url, init) => {
      assert.equal(init.headers.has(HEADER), false); assert.equal(init.cache, "no-store"); return Response.json({});
    })(ENDPOINT, { method: "POST", body: fixture.body, headers: { [HEADER]: "forged" } });
  }
  for (const message of ["Route /x used headers inside unstable_cache", "DYNAMIC_SERVER_USAGE", "Route /x with dynamic=error couldn't be rendered statically"]) {
    const error = new Error(message);
    const api = loader({ "next/headers": { headers: async () => { throw error; } } })("src/utils/server/client-context.ts");
    await assert.rejects(api.optionalRequestHeaders(), actual => actual === error);
  }
});

test("safe proxy headers preserve trusted IP only and cannot forward incoming proofs", () => {
  const { safeRequestHeaders } = loader()("src/lib/storefront-experience/runtime.ts");
  for (const ip of ["203.0.113.10", "2001:db8::1", "::ffff:192.0.2.1"]) {
    const headers = incoming(ip); headers.set(HEADER, "forged"); headers.set("x-jectstore-next-preview-query", "forged");
    const safe = safeRequestHeaders(headers, "tenant-a.test", "https:");
    assert.equal(safe.get("x-jectstore-client-ip"), ip); assert.equal(safe.has(HEADER), false);
    assert.equal(safe.has("x-jectstore-next-preview-query"), false);
  }
  for (const ip of ["garbage", "1.2.3.4, 5.6.7.8", "::1%lo0"]) assert.equal(safeRequestHeaders(incoming(ip), "tenant-a.test", "https:").has("x-jectstore-client-ip"), false);
});

test("real Apollo HttpLink signs its serialized query and rejects context URI overrides", async (t) => {
  const h = harness(t);
  const { gql } = require("@apollo/client");
  const api = h.load("src/lib/graphql-fetch.ts");
  const query = gql`query PublicViewer($text: String!) { viewer(text: $text) { id } }`;
  await api.graphqlRequest(query, { text: "Bogotá 🛍️" }, { noCache: true, context: { headers: { [HEADER]: "forged" } } });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, ENDPOINT);
  const claims = verify(h.requests[0].init);
  assert.equal(claims.ip, "203.0.113.10");
  assert.equal(JSON.parse(h.requests[0].init.body).variables.text, "Bogotá 🛍️");
  assert.equal(h.requests[0].init.headers.get("x-tenant-host"), "tenant-a.test");
  await assert.rejects(api.graphqlRequest(query, { text: "other" }, { noCache: true, context: { uri: "https://other.test/graphql" } }));
  assert.equal(h.requests.length, 1);
});

test("shared public cache excludes proof/IP but preserves host/query/variables, with fresh proof on misses", async (t) => {
  const h = harness(t);
  const { gql } = require("@apollo/client");
  const api = h.load("src/lib/graphql-fetch.ts");
  const query = gql`query PublicViewer($slug: String!) { viewer(slug: $slug) { id } }`;
  await api.graphqlRequest(query, { slug: "one" }, { tags: ["catalog"], life: "minutes" });
  h.setHeaders(incoming("2001:db8::b"));
  await api.graphqlRequest(query, { slug: "one" }, { tags: ["catalog"], life: "minutes" });
  assert.equal(h.requests.length, 1, "same public content shares the outer cache across client IPs");
  assert.deepEqual(h.cacheCalls[0], h.cacheCalls[1]);
  const serializedCache = JSON.stringify(h.cacheCalls);
  for (const secret of [fixture.key, "203.0.113.10", "2001:db8::b", HEADER, "body_sha256", "issued_at"]) assert.equal(serializedCache.includes(secret), false);
  await api.graphqlRequest(query, { slug: "two" }, { tags: ["catalog"] });
  assert.equal(verify(h.requests[1].init).ip, "2001:db8::b");
  h.setHeaders(incoming("203.0.113.30", "tenant-b.test"));
  await api.graphqlRequest(query, { slug: "one" }, { tags: ["catalog"] });
  assert.equal(verify(h.requests[2].init).host, "tenant-b.test");
  assert.notDeepEqual(h.cacheCalls[0].options.tags, h.cacheCalls[3].options.tags);
  h.setHeaders(new Headers({ host: "tenant-a.test" }));
  await assert.rejects(api.graphqlRequest(query, { slug: "one" }), { status: 503 });
  assert.equal(h.requests.length, 3, "a cache hit cannot conceal a broken active ingress");
  await assert.rejects(api.graphqlRequest(query, {}, { context: { headers: { authorization: "private" } } }), /Caching with `context` is unsafe/);
});

test("both bagisto paths sign exact JSON and never cache signed headers or read session for no-session calls", async (t) => {
  const h = harness(t);
  const api = h.load("src/utils/bagisto/index.ts");
  const options = { query: "query { ping }", variables: { text: "tienda" }, cache: "force-cache", tags: ["catalog"], revalidate: 3600, headers: { [HEADER]: "forged" } };
  await api.bagistoFetch({ ...options, isCookies: true });
  h.setHeaders(incoming("203.0.113.20"));
  await api.bagistoFetchNoSession(options);
  assert.equal(h.requests.length, 2);
  assert.equal(h.reads().cookiesReads, 1);
  assert.equal(verify(h.requests[0].init).ip, "203.0.113.10");
  assert.equal(verify(h.requests[1].init).ip, "203.0.113.20");
  assert.equal(h.requests[0].init.body, JSON.stringify({ query: options.query, variables: options.variables }));
  assert.equal(h.requests[0].init.body, h.requests[1].init.body);
  assert.equal(h.cacheCalls.length, 0);
});

test("all server query paths fail safely for active missing IP or malformed host before sending", async (t) => {
  const h = harness(t);
  const bagisto = h.load("src/utils/bagisto/index.ts");
  const graphql = h.load("src/lib/graphql-fetch.ts");
  const { gql } = require("@apollo/client");
  for (const headers of [new Headers({ host: "tenant-a.test" }), incoming("203.0.113.1", "tenant-a.test:0"), incoming("203.0.113.1", "a.test,b.test")]) {
    h.setHeaders(headers);
    for (const call of [() => bagisto.bagistoFetch({ query: "query { ping }" }), () => bagisto.bagistoFetchNoSession({ query: "query { ping }" }), () => graphql.graphqlRequest(gql`query { ping }`, {}, { noCache: true })]) {
      await assert.rejects(call(), { status: 503, message: "No pudimos conectar con la tienda. Vuelve a intentarlo." });
    }
  }
  assert.equal(h.requests.length, 0);
});

test("no HTTP request uses only an explicit absolute configured endpoint, with no proof or cookies", async (t) => {
  const h = harness(t, { withoutRequest: true, configuredUrl: ENDPOINT });
  delete process.env.STOREFRONT_RUNTIME_SIGNING_KEY;
  const api = h.load("src/utils/bagisto/index.ts");
  await api.bagistoFetch({ query: "query { ping }" });
  await api.bagistoFetchNoSession({ query: "query { ping }" });
  const { gql } = require("@apollo/client");
  await h.load("src/lib/graphql-fetch.ts").graphqlRequest(gql`query { ping }`);
  assert.equal(h.requests.length, 3);
  assert.equal(h.reads().cookiesReads, 0);
  assert.equal(h.cacheCalls.length, 0);
  for (const { init } of h.requests) { assert.equal(init.headers.has(HEADER), false); assert.equal(init.cache, "no-store"); }
});

test("build-time default relative GraphQL uses only the fixed validated backend origin", async (t) => {
  const h = harness(t, { withoutRequest: true });
  delete process.env.STOREFRONT_RUNTIME_SIGNING_KEY;
  const api = h.load("src/utils/bagisto/index.ts");
  await api.bagistoFetch({ query: "query { ping }" });
  await api.bagistoFetchNoSession({ query: "query { ping }" });
  const { gql } = require("@apollo/client");
  await h.load("src/lib/graphql-fetch.ts").graphqlRequest(gql`query { ping }`);
  assert.equal(h.requests.length, 3);
  assert.equal(h.reads().cookiesReads, 0);
  for (const { url, init } of h.requests) {
    assert.equal(url, ENDPOINT); assert.equal(init.headers.has(HEADER), false); assert.equal(init.headers.has("x-tenant-host"), false);
  }
  const { backgroundGraphqlEndpoint } = h.load("src/utils/server/client-context.ts");
  process.env.STOREFRONT_BACKEND_ORIGIN = "http://127.0.0.1:8009";
  assert.equal(backgroundGraphqlEndpoint("/graphql"), "http://127.0.0.1:8009/graphql");
  for (const origin of ["https://user:password@backend.test", "http://outside.test", "https://backend.test/graphql", "https://backend.test?secret=no", "garbage"]) {
    process.env.STOREFRONT_BACKEND_ORIGIN = origin;
    assert.throws(() => backgroundGraphqlEndpoint("/graphql"), { status: 503 });
  }
  delete process.env.STOREFRONT_BACKEND_ORIGIN; delete process.env.BAGISTO_SERVER_ENDPOINT;
  assert.throws(() => backgroundGraphqlEndpoint("/graphql"), { status: 503 });
  assert.equal(h.requests.length, 3);
});

test("shared Apollo browser module contains no server signer/key import and SSR without injection fails closed", async (t) => {
  environment(t);
  const shared = source("src/lib/apollo-client.ts");
  assert.doesNotMatch(shared, /(?:node:crypto|client-context|STOREFRONT_RUNTIME_SIGNING_KEY)/);
  assert.match(source("src/utils/server/client-context.ts"), /^import "server-only";/);
  const initialize = loader({ "@/utils/constants": { ...constants, GRAPHQL_URL: ENDPOINT }, "next-auth/react": { getSession: async () => null } })("src/lib/apollo-client.ts").default;
  const { gql } = require("@apollo/client");
  await assert.rejects(initialize().query({ query: gql`query { ping }` }), /No pudimos conectar con la tienda/);
});
