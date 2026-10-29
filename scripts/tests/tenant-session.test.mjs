import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { encode } from "next-auth/jwt";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");
function loadSource(relative, mocks = {}) {
  const file = resolve(root, relative);
  const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith(".")) return loadSource(resolve(dirname(file), `${name}.ts`), mocks);
    if (name.startsWith("@/")) return loadSource(`src/${name.slice(2)}.ts`, mocks);
    if (name.startsWith("@utils/")) return loadSource(`src/utils/${name.slice(7)}.ts`, mocks);
    return require(name);
  };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const A = "a.jectstore.test"; const B = "b.jectstore.test";
const secret = "synthetic-local-tenant-session-fixture-key";
const sessionApi = loadSource("src/utils/tenant-session.ts");
const hostApi = loadSource("src/utils/request-host.ts");
const claims = (host) => ({ sub: "same-id", id: "same-id", accessToken: "synthetic-bearer", tenant_host: host, tenant_session_version: 1 });

test("customer login query uses the installed Laravel contract without legacy invented fields", () => {
  const { CUSTOMER_LOGIN } = loadSource("src/graphql/customer/mutations/CustomerLogin.ts");
  const operation = CUSTOMER_LOGIN.definitions.find((definition) => definition.kind === "OperationDefinition");
  assert.equal(operation.operation, "mutation");
  assert.equal(operation.variableDefinitions[0].type.type.name.value, "LoginInput");
  assert.equal(operation.selectionSet.selections[0].name.value, "customerLogin");
  assert.deepEqual(operation.selectionSet.selections[0].selectionSet.selections.map((field) => field.name.value), ["success", "message", "accessToken", "customer"]);
  assert.doesNotMatch(CUSTOMER_LOGIN.loc.source.body, /createCustomerLogin|apiToken/);
});

test("ingress Host alone selects the tenant and malformed/missing authority fails closed", () => {
  const headers = new Headers({ host: "B.JECTSTORE.TEST:8089", "x-tenant-host": A, "x-storefront-host": A, "x-forwarded-host": A, forwarded: `host=${A}` });
  assert.equal(hostApi.requestHost(headers), B);
  for (const host of ["", `${A},${B}`, `${A}/path`, `https://${A}`, `user@${A}`, `${A}\\${B}`]) {
    assert.throws(() => hostApi.requestHost(new Headers({ host })));
  }
  assert.throws(() => hostApi.requestHost(new Headers({ "x-forwarded-host": A })));
});

test("authentic NextAuth JWT requires exact signed host and version; legacy requires reauthentication", async () => {
  const token = await encode({ token: claims(A), secret });
  assert.equal((await sessionApi.decodeTenantSession({ token, secret }, A)).accessToken, "synthetic-bearer");
  for (const host of [B, "app.jectstore.test", "", `${A}:8089`]) assert.equal(await sessionApi.decodeTenantSession({ token, secret }, host), null);
  for (const value of [{ sub: "legacy", accessToken: "synthetic-bearer" }, { ...claims(A), tenant_session_version: 0 }, { ...claims(A), tenant_host: A.toUpperCase() }]) {
    assert.equal(await sessionApi.decodeTenantSession({ token: await encode({ token: value, secret }), secret }, A), null);
  }
  assert.equal(await sessionApi.decodeTenantSession({ token: `${token.slice(0, -8)}tampered`, secret }, A), null);
  assert.equal(await sessionApi.decodeTenantSession({ token, secret: "different-fixture-key" }, A), null);
});

test("request-scoped auth options issue host claims only after login and never expose a foreign token", async () => {
  const requests = [];
  const { createTenantAuthOptions } = loadSource("src/utils/auth.ts", {
    "@/utils/bagisto": { bagistoFetch: async (options) => { requests.push(options); return { body: { data: { customerLogin: { customer: { id: "1", email: "qa@example.invalid" }, success: true, accessToken: "synthetic-bearer" } } } }; } },
    "@/graphql/customer/mutations": { CUSTOMER_LOGIN: "fixture-login-mutation" },
  });
  const a = createTenantAuthOptions(A); const b = createTenantAuthOptions(B);
  const user = await a.providers[0].options.authorize({ username: "qa@example.invalid", password: "synthetic-only" });
  assert.equal(requests[0].isCookies, false, "Credentials login never inherits another session's bearer or cart cookie");
  assert.equal(user.tenant_host, A);
  assert.equal(user.id, "1"); assert.equal(user.accessToken, "synthetic-bearer");
  const token = await a.callbacks.jwt({ token: {}, user });
  assert.equal(token.tenant_session_version, 1);
  const encrypted = await encode({ token, secret });
  assert.ok(await a.jwt.decode({ token: encrypted, secret }));
  assert.equal(await b.jwt.decode({ token: encrypted, secret }), null);
  const session = await a.callbacks.session({ session: { user: {}, expires: "fixture" }, token });
  assert.equal(session.user.accessToken, "synthetic-bearer");
  await assert.rejects(b.callbacks.session({ session: { user: {}, expires: "fixture" }, token }), /Invalid tenant session/);
  await assert.rejects(b.callbacks.jwt({ token: {}, user }), /Invalid tenant session/);
  await assert.rejects(a.callbacks.jwt({ token: { accessToken: "legacy" } }), /Invalid tenant session/);
  assert.ok(await a.jwt.decode({ token: encrypted, secret }), "Creating B options never mutates A's callbacks");
});

test("actual GraphQL/cart wrapper and COD host helper ignore public tenant hints", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousEndpoint = process.env.BAGISTO_SERVER_ENDPOINT;
  const previousSigningKey = process.env.STOREFRONT_RUNTIME_SIGNING_KEY;
  process.env.BAGISTO_SERVER_ENDPOINT = "http://127.0.0.1:9";
  process.env.STOREFRONT_RUNTIME_SIGNING_KEY = secret;
  t.after(() => { globalThis.fetch = previousFetch; if (previousEndpoint === undefined) delete process.env.BAGISTO_SERVER_ENDPOINT; else process.env.BAGISTO_SERVER_ENDPOINT = previousEndpoint; });
  t.after(() => { if (previousSigningKey === undefined) delete process.env.STOREFRONT_RUNTIME_SIGNING_KEY; else process.env.STOREFRONT_RUNTIME_SIGNING_KEY = previousSigningKey; });
  const headers = new Headers({ host: `${B}:8089`, "x-jectstore-client-ip": "203.0.113.20", "x-tenant-host": A, "x-storefront-host": A, "x-forwarded-host": A });
  const requests = []; const sessionHosts = [];
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return Response.json({ data: { ok: true } }); };
  const mocks = {
    "server-only": {},
    "next/headers": { headers: async () => headers, cookies: async () => ({ get: () => undefined }) },
    "next-auth": { getServerSession: async (options) => { sessionHosts.push(options.fixtureHost); return null; } },
    "@utils/auth": { createTenantAuthOptions: (host) => ({ fixtureHost: host }) },
    "@/utils/server/storefront-locale": { getStorefrontLocaleCode: async () => "es" },
    "@/utils/constants": { GRAPHQL_URL: "/graphql", STOREFRONT_KEY: "", BAGISTO_SESSION: "fixture-session" },
    "../constants": { STOREFRONT_KEY: "", BAGISTO_SESSION: "fixture-session" },
    "@/graphql/customer/mutations": {}, "@/graphql": {}, "@/graphql/theme/mutations": {},
  };
  const wrapper = loadSource("src/utils/bagisto/index.ts", mocks);
  await wrapper.bagistoFetch({ query: "query Fixture { id }", cache: "no-store" });
  await wrapper.bagistoFetchNoSession({ query: "query Fixture { id }", cache: "no-store" });
  assert.deepEqual(sessionHosts, [B]);
  for (const { url, options } of requests) {
    assert.equal(url, "http://127.0.0.1:9/graphql");
    const sent = new Headers(options.headers);
    assert.equal(sent.get("x-tenant-host"), B);
    assert.equal(sent.get("x-storefront-host"), B);
    assert.equal(sent.has("authorization"), false);
    assert.ok(sent.has("X-JectStore-Client-Context"));
  }
  const tenant = loadSource("src/utils/server/tenant-runtime.ts", mocks);
  assert.equal(await tenant.getRuntimeHost(), B);
});
