import { readFileSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { encode } from "next-auth/jwt";

// Dedicated local QA customers only. Real Next -> real isolated Laravel login;
// no checkout/cart mutation, publication, real email, or production endpoint.
const hosts = ["beauty-oct26a.localhost", "fashion-oct26a.localhost"];
const credentialPath = "/tmp/experience-qa-oct26a/security-customer-credentials.json";
const secret = randomBytes(32).toString("hex");
let checks = 0; let child; let output = "";
class QaFailure extends Error {}
const check = (value, message) => { if (!value) throw new QaFailure(message); checks++; };
const probe = createServer(); await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
function request(host, path, { cookie = "", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port, path, method: body === undefined ? "GET" : "POST", timeout: 20000, headers: { Host: `${host}:8089`, Cookie: cookie, ...headers } }, (res) => {
      let text = ""; res.setEncoding("utf8"); res.on("data", (chunk) => { text += chunk; if (text.length > 1_048_576) res.destroy(new QaFailure("Response exceeds local QA bound")); });
      res.on("error", reject); res.on("end", () => { let json; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, headers: res.headers, text, json }); });
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(new QaFailure("Local QA timeout"))); req.end(body);
  });
}
function account(host, bearer) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port: 8009, path: `/graphql?query=${encodeURIComponent("{ accountInfo { id } }")}`, timeout: 15000,
      headers: { Host: `${host}:8089`, Authorization: `Bearer ${bearer}`, Accept: "application/json" } }, (res) => {
      let text = ""; res.setEncoding("utf8"); res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => { let json; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, json }); });
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(new QaFailure("Local account query timeout"))); req.end();
  });
}
try {
  check((statSync(credentialPath).mode & 0o077) === 0, "QA credentials must stay private");
  const credentials = JSON.parse(readFileSync(credentialPath, "utf8"));
  check(credentials.email === "security-customer-qa@example.invalid" && typeof credentials.password === "string", "Only the dedicated synthetic customer may authenticate");
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXTAUTH_SECRET: secret, NEXTAUTH_URL: `http://127.0.0.1:${port}`,
      BAGISTO_SERVER_ENDPOINT: "http://127.0.0.1:8009", NEXT_PUBLIC_LANDLORD_HOST: "127.0.0.1", NEXT_PUBLIC_LANDLORD_SCHEME: "http", STOREFRONT_EXPERIENCES_ENABLED: "false", STOREFRONT_EXPERIENCE_HOSTS: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
  for (let i = 0; i < 100 && !output.includes("Ready in"); i++) { if (child.exitCode !== null) throw new QaFailure("Local candidate exited"); await new Promise((resolve) => setTimeout(resolve, 100)); }
  check(output.includes("Ready in"), "Local candidate must be ready");
  for (const host of hosts) {
    const other = hosts.find((value) => value !== host);
    const spoof = { "x-tenant-host": other, "x-storefront-host": other, "x-forwarded-host": other };
    const csrf = await request(host, "/api/auth/csrf", { headers: spoof });
    check(csrf.status === 200 && typeof csrf.json?.csrfToken === "string", "Real NextAuth CSRF required");
    const csrfCookies = (csrf.headers["set-cookie"] || []).map((value) => value.split(";", 1)[0]).join("; ");
    const login = await request(host, "/api/auth/callback/credentials", {
      cookie: csrfCookies, headers: { ...spoof, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.json.csrfToken, username: credentials.email, password: credentials.password, callbackUrl: "/", json: "true" }).toString(),
    });
    const cookie = (login.headers["set-cookie"] || []).find((value) => value.startsWith("next-auth.session-token="))?.split(";", 1)[0];
    check(login.status === 200 && Boolean(cookie), "Real Laravel customerLogin must create a bound NextAuth session");
    const own = await request(host, "/api/auth/session", { cookie, headers: spoof });
    check(own.status === 200 && own.json?.user?.id === "1" && typeof own.json.user.accessToken === "string", "Same-host synthetic customer must retain its own authenticated session");
    const ownAccount = await account(host, own.json.user.accessToken);
    check(ownAccount.status === 200 && ownAccount.json?.data?.accountInfo?.id === "1", "The backend bearer obtained by Next must authorize only its owning customer");
    const otherAccount = await account(other, own.json.user.accessToken);
    check(!otherAccount.json?.data?.accountInfo && ([401, 403].includes(otherAccount.status) || otherAccount.json?.errors?.some((error) => /unauthenticated|unauthorized|token|tenant/i.test(error.message))), "The same backend bearer must not authorize a same-ID customer on the other tenant");
    const foreign = await request(other, "/api/auth/session", { cookie, headers: { "x-tenant-host": host, "x-forwarded-host": host } });
    check(foreign.status === 200 && !foreign.json?.user && !foreign.text.includes(own.json.user.accessToken), "Authentic Next session must expose no customer/token on the other tenant");
    const central = await request("127.0.0.1", "/api/auth/session", { cookie, headers: spoof });
    check(central.status === 200 && !central.json?.user && !central.text.includes(own.json.user.accessToken), "Tenant session must not become a central session");
    const legacy = await encode({ token: { sub: "1", accessToken: own.json.user.accessToken }, secret });
    const old = await request(host, "/api/auth/session", { cookie: `next-auth.session-token=${legacy}` });
    check(old.status === 200 && !old.json?.user && !old.text.includes(own.json.user.accessToken), "Legacy unbound session must require reauthentication even with a real backend bearer");
    const ownAgain = await request(host, "/api/auth/session", { cookie });
    check(ownAgain.status === 200 && ownAgain.json?.user?.id === "1", "Rejected foreign requests must not change owning session authority");
    console.log(`${host}: real customer login and tenant-bound Next session PASS; cross-host/central/legacy denied.`);
  }
  console.log(`Real Next/Laravel customer session HTTP PASS: ${checks} checks; no cart, order, editor or publication mutation.`);
} catch (error) {
  // Raw errors/logs can contain bearer tokens or signed cookies: never print them.
  console.error(`Real customer session HTTP FAIL: ${error instanceof QaFailure ? error.message : error?.code || error?.name || "runtime"}`);
  process.exitCode = 1;
} finally {
  if (child) { child.kill("SIGTERM"); if (child.exitCode === null) await new Promise((resolve) => child.once("exit", resolve)); }
}
