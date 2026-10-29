import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, request as httpRequest } from "node:http";
import { spawn } from "node:child_process";

// Real built Next data-cache integration with an in-process HTTP provider.
// No customer DB, no external GraphQL, no production host, no real credential.
const replayDirectory = await realpath(await mkdtemp(join(tmpdir(), "jectstore-cache-http-")));
const key = randomBytes(32).toString("hex");
const contextKey = randomBytes(32).toString("hex");
let ingressIp = "203.0.113.44";
const proofIps = new Set();
const run = randomBytes(6).toString("hex");
const hostA = `a-${run}.jectstore.test`;
const hostB = `b-${run}.jectstore.test`;
const versions = new Map([[hostA, 1], [hostB, 1]]);
const misses = new Map([[hostA, 0], [hostB, 0]]);
const provider = createServer((req, res) => {
  let text = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => { text += chunk; if (text.length > 65536) req.destroy(); });
  req.on("end", () => {
    const host = String(req.headers["x-tenant-host"] || "");
    if (!versions.has(host)) { res.writeHead(403).end(); return; }
    let query = "";
    try { query = JSON.parse(text || "{}").query || ""; } catch { res.writeHead(400).end(); return; }
    const [payload, signature] = String(req.headers["x-jectstore-client-context"] || "").split(".");
    assert.equal(signature, createHmac("sha256", contextKey).update(`jectstore.client-context.v1\n${payload}`).digest("hex"));
    const context = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    assert.equal(context.host, host); assert.equal(context.ip, ingressIp);
    assert.equal(context.body_sha256, createHash("sha256").update(text).digest("hex"));
    assert.equal(context.method, "POST"); assert.equal(context.path, "/graphql");
    assert.equal(context.expires_at - context.issued_at, 60); assert.ok(context.expires_at > Date.now() / 1000);
    proofIps.add(context.ip);
    if (query.includes("query DefaultChannel")) misses.set(host, misses.get(host) + 1);
    const title = `Fixture-${host[0]}-version-${versions.get(host)}`;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: {
      getDefaultChannel: { id: "1", name: title, description: title, logoUrl: null, faviconUrl: null,
        defaultLocale: { code: "es" }, baseCurrency: { code: "MXN", symbol: "$" }, homeSeo: { metaTitle: title, metaDescription: title } },
      homeCategories: [], themeCustomization: [], allProducts: { data: [], paginatorInfo: { total: 0, count: 0, currentPage: 1, lastPage: 1 } },
    } }));
  });
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const providerPort = provider.address().port;
const port = 3006;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
  env: { ...process.env, NODE_ENV: "production", STOREFRONT_REALTIME_MODE: "false", BAGISTO_SERVER_ENDPOINT: `http://127.0.0.1:${providerPort}`,
    STOREFRONT_RUNTIME_SIGNING_KEY: contextKey,
    NEXT_PUBLIC_LANDLORD_HOST: "127.0.0.1", NEXT_PUBLIC_LANDLORD_SCHEME: "http",
    STOREFRONT_REVALIDATE_SIGNING_KEY: key, STOREFRONT_REVALIDATE_ALLOWED_HOSTS: "app.jectstore.test", STOREFRONT_REVALIDATE_REPLAY_DIR: replayDirectory },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
const request = (host, path = "/", body = null, signature = null) => new Promise((resolve, reject) => {
  const req = httpRequest({ hostname: "127.0.0.1", port, path, method: body === null ? "GET" : "POST",
    headers: { Host: host, "X-Jectstore-Client-IP": ingressIp, "X-JectStore-Client-Context": "browser-forgery", "X-Forwarded-Host": host, "X-Forwarded-Proto": "http", ...(body === null ? {} : { "Content-Type": "application/json" }),
      ...(signature ? { "X-JectStore-Revalidate-Signature": signature } : {}) }, timeout: 10000 }, (res) => {
    let text = ""; res.setEncoding("utf8"); res.on("data", (chunk) => { text += chunk; });
    res.on("end", () => resolve({ status: res.statusCode, text }));
  });
  req.on("error", reject); req.on("timeout", () => req.destroy(new Error("Fixture request timed out."))); req.end(body);
});
try {
  for (let i = 0; i < 50 && !output.includes("Ready in"); i++) {
    if (child.exitCode !== null) throw new Error("Built fixture server exited before readiness.");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(output.includes("Ready in"), true);
  for (const host of [hostA, hostB]) {
    const response = await request(host);
    assert.equal(response.status, 200);
    assert.match(response.text, new RegExp(`<title>[^<]*Fixture-${host[0]}-version-1`));
  }
  const warmMisses = new Map(misses);
  assert.ok(warmMisses.get(hostA) > 0 && warmMisses.get(hostB) > 0);
  assert.deepEqual([...proofIps], [ingressIp]);
  ingressIp = "2001:db8::44";
  versions.set(hostA, 2); versions.set(hostB, 2);
  for (const host of [hostA, hostB]) {
    assert.match((await request(host)).text, new RegExp(`<title>[^<]*Fixture-${host[0]}-version-1`));
    assert.equal(misses.get(host), warmMisses.get(host), "Warm owner cache must not re-fetch its channel.");
  }
  const body = JSON.stringify({ protocol_version: 1, tenant_id: "fixture-a", hosts: [hostA], event: "channel.updated", issued_at: Math.floor(Date.now() / 1000), request_id: randomUUID() });
  const signature = `sha256=${createHmac("sha256", key).update("jectstore.storefront.revalidate.v1\n").update(body).digest("hex")}`;
  assert.equal((await request("app.jectstore.test", "/api/internal/storefront/revalidate", body, `sha256=${"0".repeat(64)}`)).status, 401);
  assert.match((await request(hostA)).text, /<title>[^<]*Fixture-a-version-1/);
  assert.equal(misses.get(hostA), warmMisses.get(hostA));
  const ack = await request("app.jectstore.test", "/api/internal/storefront/revalidate", body, signature);
  assert.equal(ack.status, 200);
  assert.deepEqual(JSON.parse(ack.text).hosts, [hostA]);
  assert.match((await request(hostA)).text, /<title>[^<]*Fixture-a-version-2/);
  assert.ok(misses.get(hostA) > warmMisses.get(hostA));
  assert.ok(proofIps.has(ingressIp), "A cache miss signs the new client IP, while warm cache identity stays shared");
  assert.match((await request(hostB)).text, /<title>[^<]*Fixture-b-version-1/);
  assert.equal(misses.get(hostB), warmMisses.get(hostB));
  console.log("Real Next cache HTTP PASS: warm A/B hit; invalid signature no miss; signed A refreshes HTML+channel; B stays warm and unchanged.");
} finally {
  child.kill("SIGTERM");
  if (child.exitCode === null) await new Promise((resolve) => child.once("exit", resolve));
  await new Promise((resolve) => provider.close(resolve));
  assert.match(replayDirectory, /\/jectstore-cache-http-[^/]+$/);
  await rm(replayDirectory, { recursive: true, force: true });
}
