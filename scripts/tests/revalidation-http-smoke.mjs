import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";

// Run against an already-built Next server, using only ephemeral fixture keys.
const directory = await realpath(await mkdtemp(join(tmpdir(), "jectstore-http-smoke-")));
const key = randomBytes(32).toString("hex");
const port = 3005;
const host = "app.jectstore.test";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
  env: { ...process.env, STOREFRONT_REVALIDATE_SIGNING_KEY: key, STOREFRONT_REVALIDATE_ALLOWED_HOSTS: host, STOREFRONT_REVALIDATE_REPLAY_DIR: directory },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error("Fixture server exited before readiness.");
    if (output.includes("Ready in")) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, "Fixture server must be ready.");
  const body = JSON.stringify({ protocol_version: 1, tenant_id: "fixture-a", hosts: ["a.jectstore.test"], event: "smoke.test", issued_at: Math.floor(Date.now() / 1000), request_id: randomUUID() });
  const signature = `sha256=${createHmac("sha256", key).update("jectstore.storefront.revalidate.v1\n").update(body).digest("hex")}`;
  const request = (signed) => new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port, path: "/api/internal/storefront/revalidate", method: "POST", headers: { Host: host, "X-Forwarded-Host": host, "X-Forwarded-Proto": "http", "Content-Type": "application/json", ...(signed ? { "X-JectStore-Revalidate-Signature": signature } : {}) } }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, json: async () => JSON.parse(text) }));
    });
    req.on("error", reject);
    req.end(body);
  });
  assert.equal((await request(false)).status, 401);
  const response = await request(true);
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.revalidated, true);
  assert.equal(result.tenant_id, "fixture-a");
  assert.deepEqual(result.hosts, ["a.jectstore.test"]);
  assert.equal((await request(true)).status, 409);
  const legacy = await fetch(`http://127.0.0.1:${port}/api/revalidate`, { method: "POST", headers: { Host: host } });
  assert.equal(legacy.status, 410);
  console.log("Real Next HTTP smoke PASS: unsigned401, signedACK200, persistent replay409, legacy410.");
} finally {
  child.kill("SIGTERM");
  if (child.exitCode === null) await new Promise((resolve) => child.once("exit", resolve));
  assert.match(directory, /\/jectstore-http-smoke-[^/]+$/);
  await rm(directory, { recursive: true, force: true });
}
