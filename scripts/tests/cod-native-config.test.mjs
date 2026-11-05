import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { loader } from "../../tests/product-preview-test-helpers.mjs";

const load = loader({ "next/headers": { headers: async () => { throw new Error("No request credentials in these fixtures"); } } });
const reader = load("src/utils/server/cod-config-reader.ts");
const { StorefrontConnectionUnavailable } = load("src/utils/server/client-context.ts");

function environment(t, origin) {
  const values = { STOREFRONT_NATIVE_ORIGIN: origin, NEXT_PUBLIC_LANDLORD_HOST: "central.example.test" };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
}

async function server(t, handle) {
  const value = createServer(handle);
  await new Promise(done => value.listen(0, "127.0.0.1", done));
  t.after(() => new Promise(done => { value.closeAllConnections(); value.close(done); }));
  return `http://127.0.0.1:${value.address().port}`;
}

const respond = (response, value) => {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
};

test("one native read uses only the configured destination, canonical path and scoped headers", async t => {
  const calls = [], origin = await server(t, (request, response) => {
    calls.push({ method: request.method, path: request.url, headers: request.headers });
    respond(response, { synthetic: true });
  });
  environment(t, origin);
  assert.deepEqual(await reader.fetchNativeCodConfig("a.example.test", 6), { synthetic: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].path, "/api/checkout/cod/config?product_id=6");
  assert.deepEqual(calls[0].headers, { host: "a.example.test", accept: "application/json",
    "x-tenant-host": "a.example.test", "x-storefront-host": "a.example.test", connection: "close" });
});

test("concurrent tenant reads have separate request scope, never cached or shared responses", async t => {
  const calls = [], origin = await server(t, (request, response) => {
    calls.push(request.headers.host);
    respond(response, { tenant: request.headers.host, available: request.headers.host === "a.example.test" });
  });
  environment(t, origin);
  const [a, b] = await Promise.all([reader.fetchNativeCodConfig("a.example.test", 6), reader.fetchNativeCodConfig("b.example.test", 6)]);
  assert.deepEqual(a, { tenant: "a.example.test", available: true });
  assert.deepEqual(b, { tenant: "b.example.test", available: false });
  assert.equal(calls.length, 2);
  await reader.fetchNativeCodConfig("a.example.test", 6);
  assert.equal(calls.length, 3);
});

test("tenant/query data cannot select origins, identities, headers or non-integral product IDs", t => {
  environment(t, "http://127.0.0.1:9");
  for (const host of ["", "A.example.test", "a.example.test.", "a.example.test:1234", "central.example.test", "localhost", "127.0.0.1",
    "https://outside.invalid", "a.example.test,foreign.test", "a.example.test\r\nHost:other", "a.example.test/?host=other"]) {
    assert.throws(() => reader.nativeCodConfigRequest(host, 6), StorefrontConnectionUnavailable);
  }
  for (const id of [undefined, null, "6", true, 0, -1, 1.1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => reader.nativeCodConfigRequest("a.example.test", id), StorefrontConnectionUnavailable);
  }
  assert.equal(reader.nativeCodConfigRequest("a.example.test", Number.MAX_SAFE_INTEGER).url.search, `?product_id=${Number.MAX_SAFE_INTEGER}`);
  const mismatched = loader({ "@/utils/graphql-endpoint": { buildTenantForwardHeaders: () => ({
    "x-tenant-host": "other.example.test", "x-storefront-host": "other.example.test",
  }) } })("src/utils/server/cod-config-reader.ts");
  assert.throws(() => mismatched.nativeCodConfigRequest("a.example.test", 6));
});

test("missing or malformed native origin cannot fall back to landlord, caller host, proxy or credentials", t => {
  environment(t, "http://127.0.0.1:9");
  for (const value of ["", "http://outside.invalid", "http://user:pass@127.0.0.1:9", "http://127.0.0.1:9/path",
    "http://127.0.0.1:9?host=other", "http://127.0.0.1:9#fragment", "file:///tmp/file"]) {
    process.env.STOREFRONT_NATIVE_ORIGIN = value;
    assert.throws(() => reader.nativeCodConfigRequest("a.example.test", 6), StorefrontConnectionUnavailable);
  }
  process.env.STOREFRONT_NATIVE_ORIGIN = "https://configured-native.example.test";
  assert.equal(reader.nativeCodConfigRequest("a.example.test", 6).url.hostname, "configured-native.example.test");
});

test("redirects and unsuccessful statuses are not followed or treated as a plan decision", async t => {
  let status = 302, calls = 0;
  const origin = await server(t, (_request, response) => {
    calls++; response.writeHead(status, { "Content-Type": "application/json", Location: "https://must-not-follow.invalid" });
    response.end("{}");
  });
  environment(t, origin);
  for (status of [301, 302, 307, 308, 204, 400, 401, 403, 404, 419, 429, 500, 503]) {
    await assert.rejects(reader.fetchNativeCodConfig("a.example.test", 6), StorefrontConnectionUnavailable);
  }
  assert.equal(calls, 13);
});

test("malformed, compressed, oversized and truncated responses fail closed without body details", async t => {
  let mode = "json";
  const origin = await server(t, (_request, response) => {
    if (mode === "json") { response.writeHead(200, { "Content-Type": "application/json" }); response.end("{SECRET-DETAIL"); }
    if (mode === "type") { response.writeHead(200, { "Content-Type": "text/html" }); response.end("SECRET-DETAIL"); }
    if (mode === "encoding") { response.writeHead(200, { "Content-Type": "application/json", "Content-Encoding": "gzip" }); response.end("SECRET-DETAIL"); }
    if (mode === "length") { response.writeHead(200, { "Content-Type": "application/json", "Content-Length": String(reader.COD_CONFIG_MAX_BYTES + 1) }); response.end(); }
    if (mode === "stream") { response.writeHead(200, { "Content-Type": "application/json" }); response.end(" ".repeat(reader.COD_CONFIG_MAX_BYTES + 1)); }
    if (mode === "truncated") { response.writeHead(200, { "Content-Type": "application/json", "Content-Length": "100" }); response.flushHeaders(); response.write("{"); response.destroy(); }
  });
  environment(t, origin);
  for (mode of ["json", "type", "encoding", "length", "stream", "truncated"]) {
    await assert.rejects(reader.fetchNativeCodConfig("a.example.test", 6), error => {
      assert.ok(error instanceof StorefrontConnectionUnavailable);
      assert.doesNotMatch(error.message, /SECRET|DETAIL/); return true;
    });
  }
});

test("an unresponsive native read has a bounded five-second timeout", async t => {
  const origin = await server(t, () => {});
  environment(t, origin);
  const start = performance.now();
  await assert.rejects(reader.fetchNativeCodConfig("a.example.test", 6), StorefrontConnectionUnavailable);
  assert.equal(reader.COD_CONFIG_TIMEOUT_MS, 5000);
  assert.ok(performance.now() - start < 6500);
});

const snapshot = { id: 6, title: "Synthetic product", image: null, base_price: 27000,
  currency_code: "COP", has_variants: false, is_saleable: true, type: "simple", attributes: [], variant_index: {} };
const backendConfig = (overrides = {}) => ({ feature_key: "cash_on_delivery", product_id: 6, plan_name: "mipyme",
  allowed_by_plan: true, cod_active: true, available: true, reason: null, product_allows_cod: true,
  product_is_stockable: true, product_snapshot: snapshot, modal: { modal_enabled: true }, ...overrides });

function resolverFixture(payload, failure = null) {
  const calls = { metadata: 0, native: 0 };
  const localLoad = loader({ "./cod-config-reader": { async fetchNativeCodConfig(host, id) {
    calls.native++; assert.equal(host, "a.example.test"); assert.equal(id, 6);
    if (failure) throw failure; return structuredClone(payload);
  } }, "@/utils/server/cod-product-snapshot": { async getCodProductSnapshot() { calls.metadata++; return null; } },
  "@/utils/server/tenant-runtime": { getRuntimeHost: async () => "a.example.test" } });
  const resolver = localLoad("src/utils/server/cod-config.ts");
  const route = localLoad("src/app/api/checkout/cod/config/route.ts");
  return { resolver, route, calls, localLoad };
}

test("confirmed backend denial preserves every decision/reason and the real modal setting", async () => {
  for (const overrides of [
    { available: false, allowed_by_plan: false, reason: "cod_disabled" },
    { available: false, cod_active: false, reason: "cod_inactive" },
    { available: false, product_allows_cod: false, reason: "product_blocks_cod" },
    { available: false, product_is_stockable: null, product_snapshot: null, reason: "product_not_found" },
  ]) {
    const actual = resolverFixture(backendConfig(overrides));
    const result = await actual.resolver.resolveCodCheckoutConfig("a.example.test", 6);
    assert.equal(result.available, false); assert.equal(result.reason, overrides.reason);
    assert.equal(result.allowed_by_plan, overrides.allowed_by_plan ?? true);
    assert.equal(result.cod_active, overrides.cod_active ?? true);
    assert.equal(result.modal.modal_enabled, true);
    assert.equal(actual.calls.metadata, 0);
  }
});

test("contract mismatch, missing backend decisions and foreign product metadata never grant availability", async () => {
  for (const value of [null, [], {}, backendConfig({ product_id: 7 }), backendConfig({ allowed_by_plan: undefined }),
    backendConfig({ available: undefined }), backendConfig({ product_allows_cod: "true" }), backendConfig({ reason: "unexpected reason" }),
    backendConfig({ product_snapshot: { ...snapshot, id: 7 } }), backendConfig({ available: true, cod_active: false })]) {
    const actual = resolverFixture(value);
    await assert.rejects(actual.resolver.resolveCodCheckoutConfig("a.example.test", 6));
    assert.equal(actual.calls.metadata, 0);
  }
});

test("the real GET handler returns transport503 with retry headers, never fabricated plan403 or memory success", async () => {
  const actual = resolverFixture(null);
  const response = await actual.route.GET(new Request("https://a.example.test/api/checkout/cod/config?product_id=6"));
  assert.equal(response.status, 503); assert.equal(response.headers.get("retry-after"), "5");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.deepEqual(body, { message: "No pudimos conectar con la tienda. Vuelve a intentarlo." });
  assert.equal(actual.calls.native, 1); assert.equal(actual.calls.metadata, 0);
});

test("unexpected handler errors are generic, while confirmed plan restrictions remain403", async () => {
  const broken = resolverFixture(null, new Error("SECRET provider token /internal/path"));
  const failure = await broken.route.GET(new Request("https://a.example.test/api/checkout/cod/config?product_id=6"));
  assert.equal(failure.status, 500); assert.doesNotMatch(await failure.text(), /SECRET|token|internal/);
  const denied = resolverFixture(backendConfig({ allowed_by_plan: false, available: false, reason: "cod_disabled" }));
  const result = await denied.route.GET(new Request("https://a.example.test/api/checkout/cod/config?product_id=6"));
  assert.equal(result.status, 403); assert.equal((await result.json()).reason, "cod_disabled");
});
