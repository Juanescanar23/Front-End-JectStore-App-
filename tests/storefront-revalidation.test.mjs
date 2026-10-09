import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, realpath, chmod, rm, readdir, mkdir, symlink, writeFile, utimes, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

// Execute the actual TS source without a second implementation or emitted files.
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
function loadTs(relative, mocks = {}) {
  const filename = resolve(root, relative);
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  const localRequire = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith(".")) return loadTs(resolve(dirname(filename), `${id}.ts`), mocks);
    if (id.startsWith("@/")) return loadTs(`src/${id.slice(2)}.ts`, mocks);
    return require(id);
  };
  new Function("require", "module", "exports", output)(localRequire, testModule, testModule.exports);
  return testModule.exports;
}
const protocol = loadTs("src/utils/server/storefront-revalidation.ts");
const scope = loadTs("src/utils/storefront-cache-scope.ts");
const KEY = "fixture-signing-key-not-a-real-secret-2026";
const NOW = Math.floor(Date.now() / 1000);
const PREFIX = "jectstore.storefront.revalidate.v1\n";
function payload(overrides = {}) {
  return { protocol_version: 1, tenant_id: "fixture-a", hosts: ["a.jectstore.test"], event: "channel.updated", issued_at: NOW, request_id: "d99b0a8e-b843-41a5-8d9e-d6ce251c6886", ...overrides };
}
function input(body = JSON.stringify(payload()), overrides = {}) {
  return { method: "POST", url: "https://app.jectstore.test/api/internal/storefront/revalidate", host: "app.jectstore.test", contentType: "application/json", body, signature: `sha256=${createHmac("sha256", KEY).update(PREFIX).update(body).digest("hex")}`, ...overrides };
}
async function fixture(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "jectstore-revalidation-")));
  await chmod(base, 0o700);
  t.after(async () => { assert.match(base, /\/jectstore-revalidation-[^/]+$/); await rm(base, { recursive: true, force: true }); });
  const calls = [];
  const options = { signingKey: KEY, allowedReceiverHosts: ["app.jectstore.test"], replayDirectory: base, now: () => NOW, invalidateHosts: async (hosts) => { calls.push(hosts); } };
  return { base, calls, options };
}

test("authenticates exact bytes and acknowledges the signed owner, hosts and nonce", async (t) => {
  const f = await fixture(t);
  const result = await protocol.handleStorefrontRevalidation(input(), f.options);
  assert.deepEqual(result, { status: 200, body: { revalidated: true, protocol_version: 1, tenant_id: "fixture-a", hosts: ["a.jectstore.test"], request_id: payload().request_id } });
  assert.deepEqual(f.calls, [["a.jectstore.test"]]);
  const claims = await readdir(f.base);
  assert.equal(claims.length, 1);
  assert.equal((await stat(join(f.base, claims[0]))).mode & 0o777, 0o600);
});

for (const [label, overrides, status] of [
  ["unsigned", { signature: "" }, 401],
  ["wrong digest", { signature: `sha256=${"0".repeat(64)}` }, 401],
  ["byte mutation", { body: `${JSON.stringify(payload())}\n` }, 401],
  ["GET", { method: "GET" }, 405],
  ["merchant host", { host: "a.jectstore.test", url: "https://a.jectstore.test/api/internal/storefront/revalidate" }, 403],
  ["spoofed URL host", { url: "https://other.jectstore.test/api/internal/storefront/revalidate" }, 403],
  ["query credential", { url: "https://app.jectstore.test/api/internal/storefront/revalidate?secret=ignored" }, 403],
  ["other route", { url: "https://app.jectstore.test/api/revalidate" }, 403],
  ["non-JSON", { contentType: "text/plain" }, 400],
  ["oversized", { body: "a".repeat(16_385) }, 400],
]) test(`rejects ${label} before cache mutation`, async (t) => {
  const f = await fixture(t);
  const result = await protocol.handleStorefrontRevalidation(input(undefined, overrides), f.options);
  assert.equal(result.status, status);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(await readdir(f.base), []);
});

for (const [label, changes] of [
  ["expired", { issued_at: NOW - 301 }], ["future", { issued_at: NOW + 301 }],
  ["version", { protocol_version: 2 }], ["numeric owner", { tenant_id: 23 }],
  ["owner control", { tenant_id: "a\nB" }], ["empty hosts", { hosts: [] }],
  ["too many hosts", { hosts: Array.from({ length: 51 }, (_, i) => `${i}.jectstore.test`).sort() }],
  ["platform host", { hosts: ["app.jectstore.test"] }], ["duplicate", { hosts: ["a.jectstore.test", "a.jectstore.test"] }],
  ["unsorted", { hosts: ["z.jectstore.test", "a.jectstore.test"] }],
  ["uppercase", { hosts: ["A.jectstore.test"] }], ["port", { hosts: ["a.jectstore.test:443"] }],
  ["IP", { hosts: ["127.0.0.1"] }], ["URL", { hosts: ["https://a.jectstore.test"] }],
  ["trailing dot", { hosts: ["a.jectstore.test."] }], ["path", { hosts: ["a.jectstore.test/private"] }],
  ["invalid UUID", { request_id: "arbitrary" }], ["extra instruction", { paths: ["/"] }],
]) test(`rejects signed malformed ${label} payload`, async (t) => {
  const f = await fixture(t);
  assert.equal((await protocol.handleStorefrontRevalidation(input(JSON.stringify(payload(changes))), f.options)).status, 400);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(await readdir(f.base), []);
});

test("persistent atomic replay protection serializes concurrent requests", async (t) => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 16 }, () => protocol.handleStorefrontRevalidation(input(), f.options)));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 15);
  assert.equal(f.calls.length, 1);
  const reloaded = loadTs("src/utils/server/storefront-revalidation.ts");
  assert.equal((await reloaded.handleStorefrontRevalidation(input(), { ...f.options })).status, 409);
});

test("failed invalidation has no success ACK and consumed nonce cannot retry", async (t) => {
  const f = await fixture(t);
  assert.equal((await protocol.handleStorefrontRevalidation(input(), { ...f.options, invalidateHosts: async () => { throw new Error("fixture failure"); } })).status, 503);
  assert.equal((await protocol.handleStorefrontRevalidation(input(), f.options)).status, 409);
  assert.deepEqual(f.calls, []);
});

test("fails closed for absent, shared, public, symlinked replay stores and weak keys", async (t) => {
  const f = await fixture(t);
  const privateDir = join(f.base, "private");
  await mkdir(privateDir, { mode: 0o700 });
  const alias = join(f.base, "alias");
  await symlink(privateDir, alias);
  const publicDir = join(f.base, "public");
  await mkdir(publicDir, { mode: 0o700 });
  const shared = join(f.base, "shared");
  await mkdir(shared, { mode: 0o755 });
  for (const replayDirectory of ["", "/", "relative", join(f.base, "missing"), shared, alias, publicDir]) {
    assert.equal((await protocol.handleStorefrontRevalidation(input(), { ...f.options, replayDirectory })).status, 503);
  }
  assert.equal((await protocol.handleStorefrontRevalidation(input(), { ...f.options, signingKey: "short" })).status, 503);
  assert.deepEqual(f.calls, []);
});

test("TTL cleanup only removes old regular files in the private claim namespace", async (t) => {
  const f = await fixture(t);
  const old = join(f.base, `${"a".repeat(64)}.claim`);
  const untouched = join(f.base, "unrelated.txt");
  await writeFile(old, "old", { mode: 0o600 });
  await writeFile(untouched, "not a claim", { mode: 0o600 });
  await utimes(old, NOW - 1000, NOW - 1000);
  await utimes(untouched, NOW - 1000, NOW - 1000);
  assert.equal((await protocol.handleStorefrontRevalidation(input(), f.options)).status, 200);
  assert.equal((await readdir(f.base)).includes("unrelated.txt"), true);
  assert.equal((await readdir(f.base)).includes(`${"a".repeat(64)}.claim`), false);
});

test("bounds streaming bodies before buffering and rejects malformed UTF-8", async () => {
  assert.equal(await protocol.readRevalidationBody(new Blob(["{", "}"]).stream(), "2"), "{}");
  await assert.rejects(protocol.readRevalidationBody(null, "16385"));
  await assert.rejects(protocol.readRevalidationBody(null, "not-an-integer"));
  let cancelled = false;
  const oversized = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(16_385)); }, cancel() { cancelled = true; } });
  await assert.rejects(protocol.readRevalidationBody(oversized, null));
  assert.equal(cancelled, true);
  await assert.rejects(protocol.readRevalidationBody(new Blob([new Uint8Array([0xff])]).stream(), null));
});

test("owner tags are host-canonical, bounded and never shared across tenants", async () => {
  const a = await scope.storefrontCacheTags("A.jectstore.test.:443", ["products", "product-1", "products"]);
  const b = await scope.storefrontCacheTags("b.jectstore.test", ["products", "product-1"]);
  assert.equal(a[0], await scope.storefrontHostTag("a.jectstore.test"));
  assert.equal(a.length, 3);
  assert.equal(a.some((tag) => b.includes(tag)), false);
  assert.equal(a.every((tag) => tag.length < 256 && !tag.includes("jectstore.test")), true);
  assert.equal((await scope.storefrontCacheTags("a.jectstore.test"))[0], a[0]);
  await assert.rejects(scope.storefrontHostTag("https://a.jectstore.test/private"));
});

test("actual invalidator only expires host A, never global paths or host B", async () => {
  const mutations = [];
  const invalidator = loadTs("src/utils/server/revalidate-storefront.ts", { "next/cache": { revalidateTag: (...args) => mutations.push(args), revalidatePath: () => { throw new Error("global path invalidation forbidden"); } } });
  const ownerA = await scope.storefrontHostTag("a.jectstore.test");
  const ownerB = await scope.storefrontHostTag("b.jectstore.test");
  await invalidator.revalidateStorefront(["a.jectstore.test"]);
  assert.deepEqual(mutations, [[ownerA, { expire: 0 }]]);
  assert.equal(mutations.some(([tag]) => tag === ownerB || tag === "products"), false);
});

test("legacy routes are failclosed without reading credentials or invalidating", async () => {
  const nextServer = { NextResponse: { json: (body, init) => ({ body, ...init }) } };
  for (const route of ["src/app/api/revalidate/route.ts", "src/app/api/revalidate-theme/route.ts", "src/app/api/auth/revalidate-theme/route.ts", "src/app/revalidate-theme/route.ts"]) {
    const result = await loadTs(route, { "next/server": nextServer }).POST();
    assert.equal(result.status, 410);
    assert.equal(result.body.revalidated, false);
    assert.equal(result.headers["Cache-Control"], "no-store");
  }
});

test("graphql cache keys remain deterministic and actual query caches only invalidate owner A", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRealtime = process.env.STOREFRONT_REALTIME_MODE;
  process.env.NODE_ENV = "production";
  process.env.STOREFRONT_REALTIME_MODE = "false";
  try {
    let host = "a.jectstore.test";
    let fetches = 0;
    const entries = new Map();
    const mockedCache = {
      unstable_cache: (callback, keys, options) => async () => {
        const key = keys.join("|");
        if (!entries.has(key)) entries.set(key, { value: await callback(), tags: options.tags });
        return entries.get(key).value;
      },
      revalidateTag: (tag) => { for (const [key, entry] of entries) { if (entry.tags.includes(tag)) entries.delete(key); } },
    };
    const graphql = loadTs("src/lib/graphql-fetch.ts", {
      "next/cache": mockedCache,
      "next/headers": { headers: async () => new Headers({ host }) },
      "graphql": { print: () => "query Products { products { id } }" },
      "./apollo-client": { default: () => ({ query: async () => ({ data: { sequence: ++fetches, host } }) }) },
      "@/utils/constants": { GRAPHQL_URL: "/graphql" },
      "@/utils/graphql-endpoint": { resolveServerGraphqlUrl: () => "/graphql", buildTenantForwardHeaders: () => ({}), resolveTenantHostForRequest: (h) => h },
    });
    assert.equal(graphql.stableStringify({ b: 2, a: { z: 3, c: 1 } }), graphql.stableStringify({ a: { c: 1, z: 3 }, b: 2 }));
    const query = {};
    const a = await graphql.graphqlRequest(query, { b: 2, a: 1 }, { tags: ["products"], life: "hours" });
    assert.deepEqual(await graphql.graphqlRequest(query, { a: 1, b: 2 }, { tags: ["products"], life: "hours" }), a);
    host = "b.jectstore.test";
    const b = await graphql.graphqlRequest(query, { a: 1, b: 2 }, { tags: ["products"], life: "hours" });
    assert.equal(fetches, 2);
    const invalidator = loadTs("src/utils/server/revalidate-storefront.ts", { "next/cache": mockedCache });
    await invalidator.revalidateStorefront(["a.jectstore.test"]);
    assert.deepEqual(await graphql.graphqlRequest(query, { a: 1, b: 2 }, { tags: ["products"], life: "hours" }), b);
    assert.equal(fetches, 2);
    host = "a.jectstore.test";
    const fresh = await graphql.graphqlRequest(query, { a: 1, b: 2 }, { tags: ["products"], life: "hours" });
    assert.equal(fresh.sequence, 3);
    assert.equal(fresh.host, host);
    assert.equal(entries.size, 2);
    assert.equal(readFileSync(join(root, "src/lib/graphql-fetch.ts"), "utf8").includes("cacheKeyMemo"), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousRealtime === undefined) delete process.env.STOREFRONT_REALTIME_MODE; else process.env.STOREFRONT_REALTIME_MODE = previousRealtime;
  }
});

test("both legacy fetch wrappers always add owner tags, not just optional entity tags", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => { calls.push(options); return { status: 200, json: async () => ({ data: {} }) }; };
  try {
    const fetcher = loadTs("src/utils/bagisto/index.ts", {
      "next/headers": { headers: async () => new Headers({ host: "a.jectstore.test" }), cookies: async () => ({ get: () => undefined }) },
      "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
      "next-auth": { getServerSession: async () => null },
      "../constants": { BAGISTO_SESSION: "fixture", HIDDEN_PRODUCT_TAG: "fixture", STOREFRONT_KEY: "fixture" },
      "@/utils/constants": { GRAPHQL_URL: "https://app.jectstore.test/graphql" },
      "@/graphql/customer/mutations": {}, "@/graphql": {}, "@/graphql/theme/mutations": {}, "@utils/auth": {},
      "@/utils/server/storefront-locale": { getStorefrontLocaleCode: async () => "es" },
      "@/utils/graphql-endpoint": { resolveServerGraphqlUrl: () => "https://app.jectstore.test/graphql", buildTenantForwardHeaders: (host) => ({ "x-tenant-host": host }) },
    });
    await fetcher.bagistoFetch({ query: "query X { id }", isCookies: false });
    await fetcher.bagistoFetchNoSession({ query: "query X { id }", tags: ["products"] });
    assert.equal(calls.length, 2);
    const owner = await scope.storefrontHostTag("a.jectstore.test");
    assert.deepEqual(calls[0].next.tags, [owner]);
    assert.equal(calls[1].next.tags[0], owner);
    assert.equal(calls[1].next.tags.includes("products"), false);
    assert.equal(calls[1].headers["x-tenant-host"], "a.jectstore.test");
  } finally { globalThis.fetch = previousFetch; }
});

test("actual HTTP adapter uses bounded body transport and strict protocol ACK", async (t) => {
  const f = await fixture(t);
  const keys = ["STOREFRONT_REVALIDATE_SIGNING_KEY", "STOREFRONT_REVALIDATE_ALLOWED_HOSTS", "STOREFRONT_REVALIDATE_REPLAY_DIR"];
  const originals = keys.map((key) => process.env[key]);
  process.env[keys[0]] = KEY; process.env[keys[1]] = "app.jectstore.test"; process.env[keys[2]] = f.base;
  const invalidations = [];
  try {
    const route = loadTs("src/app/api/internal/storefront/revalidate/route.ts", {
      "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
      "@/utils/server/revalidate-storefront": { revalidateStorefront: async (hosts) => invalidations.push(hosts) },
    });
    const request = input();
    const makeRequest = () => new Request(request.url, { method: "POST", headers: { host: request.host, "content-type": request.contentType, "x-jectstore-revalidate-signature": request.signature }, body: request.body });
    const result = await route.POST(makeRequest());
    assert.equal(result.status, 200);
    assert.equal(result.body.request_id, payload().request_id);
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.equal((await route.POST(makeRequest())).status, 409);
    assert.equal((await route.POST(new Request(request.url, { method: "POST", headers: { host: request.host }, body: "x".repeat(16_385) }))).status, 400);
    assert.deepEqual(invalidations, [["a.jectstore.test"]]);
  } finally { keys.forEach((key, i) => { if (originals[i] === undefined) delete process.env[key]; else process.env[key] = originals[i]; }); }
});

test("HTTP adapter accepts internal proxy URL but never trusts forwarded host authority", async (t) => {
  const f = await fixture(t);
  const names = ["STOREFRONT_REVALIDATE_SIGNING_KEY", "STOREFRONT_REVALIDATE_ALLOWED_HOSTS", "STOREFRONT_REVALIDATE_REPLAY_DIR"];
  const originals = names.map((key) => process.env[key]);
  process.env[names[0]] = KEY; process.env[names[1]] = "app.jectstore.test"; process.env[names[2]] = f.base;
  const calls = [];
  try {
    const route = loadTs("src/app/api/internal/storefront/revalidate/route.ts", {
      "next/server": { NextResponse: { json: (body, init) => ({ body, ...init }) } },
      "@/utils/server/revalidate-storefront": { revalidateStorefront: async (hosts) => calls.push(hosts) },
    });
    const request = input();
    const make = (host, headers = {}, path = "/api/internal/storefront/revalidate") => new Request(`http://127.0.0.1:3005${path}`, {
      method: "POST", headers: { host, "content-type": "application/json", "x-jectstore-revalidate-signature": request.signature, ...headers }, body: request.body,
    });
    assert.equal((await route.POST(make("a.jectstore.test", { "x-forwarded-host": "app.jectstore.test", "x-tenant-host": "app.jectstore.test" }))).status, 403);
    assert.equal((await route.POST(make("app.jectstore.test@other.test"))).status, 403);
    assert.equal((await route.POST(make("app.jectstore.test", {}, "/api/internal/storefront/revalidate?secret=ignored"))).status, 403);
    assert.equal((await route.POST(make("app.jectstore.test", { "x-forwarded-host": "other.test", "x-tenant-host": "b.jectstore.test" }))).status, 200);
    assert.deepEqual(calls, [["a.jectstore.test"]]);
  } finally { names.forEach((name, i) => { if (originals[i] === undefined) delete process.env[name]; else process.env[name] = originals[i]; }); }
});
