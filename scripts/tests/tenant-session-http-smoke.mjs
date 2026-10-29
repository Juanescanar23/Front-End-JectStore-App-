import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { encode, decode } from "next-auth/jwt";

// Actual built NextAuth session/login/getServerSession/API boundary, with only an
// in-process synthetic backend. No real account, cart, order or publication.
const run = randomBytes(5).toString("hex");
const A = `auth-a-${run}.jectstore.test`; const B = `auth-b-${run}.jectstore.test`;
const central = "127.0.0.1";
const secret = randomBytes(32).toString("hex");
const contextKey = randomBytes(32).toString("hex");
const ingressIp = "203.0.113.41";
const calls = []; let assertions = 0; let child; let output = "";
const check = (condition, label) => { assert.ok(condition, label); assertions++; };
const provider = createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) { text += chunk; if (text.length > 65536) { req.destroy(); return; } }
  const host = String(req.headers["x-tenant-host"] || "");
  let query; try { query = JSON.parse(text).query || ""; } catch { res.writeHead(400).end(); return; }
  const proof = String(req.headers["x-jectstore-client-context"] || "");
  const [payload, signature] = proof.split(".");
  assert.equal(signature, createHmac("sha256", contextKey).update(`jectstore.client-context.v1\n${payload}`).digest("hex"), "Backend must receive a genuine server context, not the browser's proof");
  const context = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.equal(context.host, host); assert.equal(context.ip, ingressIp);
  assert.equal(context.method, req.method); assert.equal(context.path, req.url);
  assert.equal(context.body_sha256, createHash("sha256").update(text).digest("hex"));
  assert.equal(context.expires_at - context.issued_at, 60); assert.ok(context.expires_at > Date.now() / 1000);
  assert.equal(req.headers["x-jectstore-client-ip"], undefined);
  calls.push({ host, authorization: req.headers.authorization, query, context });
  if (![A, B].includes(host)) { res.writeHead(403).end(); return; }
  const bearer = `synthetic-bearer-for-${host}`;
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ data: {
    getDefaultChannel: { id: "1", code: "default", name: "Synthetic auth QA", description: "Fixture", logoUrl: null, faviconUrl: null, defaultLocale: { code: "es" }, baseCurrency: { code: "COP" }, homeSeo: { metaTitle: "Synthetic auth QA", metaDescription: "Fixture" } },
    homeCategories: [], themeCustomization: [],
    customerLogin: { customer: { id: "same-customer-id", email: "qa@example.invalid" }, success: true, accessToken: bearer },
    createReadCart: { readCart: null }, collectionPaymentMethods: [],
  } }));
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const portProbe = createServer(); await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port; await new Promise((resolve) => portProbe.close(resolve));
function request(host, path, { cookie = "", body, headers = {}, trustedIngress = true } = {}) {
  // Model the private ingress boundary: overwrite the caller's IP, never rely
  // on a backend-mock-only injection or a product bypass flag.
  const outgoing = new Headers({ Host: host, Cookie: cookie, ...headers });
  outgoing.delete("X-Jectstore-Client-IP");
  if (trustedIngress) outgoing.set("X-Jectstore-Client-IP", ingressIp);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port, path, method: body === undefined ? "GET" : "POST", timeout: 15000, headers: Object.fromEntries(outgoing) }, (res) => {
      let text = ""; res.setEncoding("utf8"); res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => { let json; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, headers: res.headers, text, json }); });
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(new Error("Local auth fixture timeout"))); req.end(body);
  });
}
const sessionCookie = (jwt) => `next-auth.session-token=${jwt}`;
const spoof = { "x-tenant-host": A, "x-storefront-host": A, "x-forwarded-host": A, "x-original-host": A, forwarded: `host=${A}` };
try {
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXTAUTH_SECRET: secret, NEXTAUTH_URL: `http://127.0.0.1:${port}`,
      STOREFRONT_RUNTIME_SIGNING_KEY: contextKey,
      BAGISTO_SERVER_ENDPOINT: `http://127.0.0.1:${provider.address().port}`, NEXT_PUBLIC_LANDLORD_HOST: central, NEXT_PUBLIC_LANDLORD_SCHEME: "http", STOREFRONT_EXPERIENCES_ENABLED: "false", STOREFRONT_EXPERIENCE_HOSTS: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
  for (let i = 0; i < 100 && !output.includes("Ready in"); i++) { if (child.exitCode !== null) throw new Error("Local Next exited"); await new Promise((resolve) => setTimeout(resolve, 100)); }
  check(output.includes("Ready in"), "Built Next starts");

  const missingIngress = await request(B, "/api/cart-detail", { body: "{}", trustedIngress: false, headers: { "Content-Type": "application/json", "X-Forwarded-For": ingressIp, "X-JectStore-Client-Context": "browser-forgery" } });
  check(missingIngress.status === 503 && missingIngress.json?.message === "No pudimos conectar con la tienda. Vuelve a intentarlo." && !missingIngress.json?.error, "Missing ingress fails closed with generic HTTP503 and no error details");
  check(/no-store/.test(missingIngress.headers["cache-control"] || "") && missingIngress.headers["retry-after"] === "5", "Unavailable context cannot be cached and exposes only a bounded retry hint");
  check(calls.length === 0, "Unsigned active request cannot contact the backend or adopt a browser proof");

  const csrf = await request(B, "/api/auth/csrf", { headers: spoof });
  check(csrf.status === 200 && typeof csrf.json?.csrfToken === "string", "Actual NextAuth CSRF endpoint");
  const csrfCookie = (csrf.headers["set-cookie"] || []).map((value) => value.split(";", 1)[0]).join("; ");
  const login = await request(B, "/api/auth/callback/credentials", {
    cookie: csrfCookie, headers: { ...spoof, "Content-Type": "application/x-www-form-urlencoded", "X-JectStore-Client-Context": "browser-forgery", "X-Jectstore-Client-IP": "198.51.100.99" },
    body: new URLSearchParams({ csrfToken: csrf.json.csrfToken, username: "qa@example.invalid", password: "synthetic-only", callbackUrl: `http://${B}/`, json: "true" }).toString(),
  });
  check(login.status === 200, "Actual credentials callback succeeds for owning host");
  const cookie = (login.headers["set-cookie"] || []).find((value) => value.startsWith("next-auth.session-token="));
  check(Boolean(cookie) && /HttpOnly/i.test(cookie) && !/;\s*Domain=/i.test(cookie), "NextAuth cookie remains HttpOnly and host-only");
  const jwt = cookie.split(";", 1)[0].slice("next-auth.session-token=".length);
  const claims = await decode({ token: jwt, secret });
  check(claims.tenant_host === B && claims.tenant_session_version === 1, "Actual login cryptographically binds the ingress host, not spoofed headers");
  check(calls.filter((call) => call.query.includes("loginCustomer")).every((call) => call.host === B && !call.authorization), "Login goes only to B without inheriting a session bearer");
  check(calls.some((call) => call.query.includes("customerLogin") && call.context.ip === ingressIp), "Actual login replaces the invented proof with the trusted ingress context");
  const own = await request(B, "/api/auth/session", { cookie: sessionCookie(jwt), headers: spoof });
  check(own.status === 200 && own.json?.user?.accessToken === `synthetic-bearer-for-${B}`, "Owning tenant can read its own session");

  const legacy = await encode({ token: { sub: "legacy-id", accessToken: "legacy-private-fixture" }, secret });
  const wrongVersion = await encode({ token: { ...claims, tenant_session_version: 0 }, secret });
  for (const [host, value, label] of [[A, jwt, "foreign host"], [central, jwt, "central mismatch"], [B, legacy, "unbound legacy"], [B, wrongVersion, "old version"]]) {
    const response = await request(host, "/api/auth/session", { cookie: sessionCookie(value), headers: spoof });
    check(response.status === 200 && !response.json?.user && !response.text.includes("synthetic-bearer") && !response.text.includes("legacy-private"), `Session hides credentials for ${label}`);
    check((response.headers["set-cookie"] || []).some((value) => value.startsWith("next-auth.session-token=") && /Max-Age=0/.test(value)), `Invalid ${label} session is cleared for reauthentication`);
  }

  for (const path of ["/api/cart-detail", "/api/checkout/paymentMethods"]) {
    const beforeOwn = calls.length;
    const ownApi = await request(B, path, { cookie: sessionCookie(jwt), body: "{}", headers: { ...spoof, "Content-Type": "application/json" } });
    check(ownApi.status === 200 && calls.slice(beforeOwn).some((call) => call.authorization === `Bearer synthetic-bearer-for-${B}`), "getServerSession forwards only an owning session bearer");
    const beforeForeign = calls.length;
    const foreignApi = await request(A, path, { cookie: sessionCookie(jwt), body: "{}", headers: { "x-tenant-host": B, "x-forwarded-host": B, "Content-Type": "application/json" } });
    check(foreignApi.status === 200 && calls.slice(beforeForeign).length > 0 && calls.slice(beforeForeign).every((call) => call.host === A && !call.authorization), "Foreign session never sends B's bearer to cart/checkout on A");
  }
  const ownLogin = await request(B, "/customer/login", { cookie: sessionCookie(jwt) });
  const foreignLogin = await request(A, "/customer/login", { cookie: sessionCookie(jwt) });
  const legacyLogin = await request(B, "/customer/login", { cookie: sessionCookie(legacy) });
  check(ownLogin.status === 307, "Owning session retains login redirect");
  check(foreignLogin.status === 200 && legacyLogin.status === 200, "Foreign and legacy sessions can reauthenticate rather than being redirected as authenticated");
  console.log(`Tenant session actual Next HTTP PASS: ${assertions} checks; credentials login, signed host binding, cross-host/central/legacy rejection, session secrecy and cart/checkout authority.`);
} finally {
  // Do not dump logs: a failed auth response can contain a cookie or fixture bearer.
  if (child) { child.kill("SIGTERM"); if (child.exitCode === null) await new Promise((resolve) => child.once("exit", resolve)); }
  await new Promise((resolve) => provider.close(resolve));
}
