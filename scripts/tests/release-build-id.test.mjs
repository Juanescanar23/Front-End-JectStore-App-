import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const headers = [{ source: "/_next/static/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] }];
function config(uuid = randomUUID) {
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(path.join(root, "next.config.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, require(name) {
    if (name === "@/utils/constants") return { configHeader: headers };
    if (name === "node:crypto") return { randomUUID: uuid };
    assert.fail(`Unexpected config dependency: ${name}`);
  } }, { timeout: 1000 });
  return module.exports.default;
}

test("each real build receives a distinct path-safe ID without replacing the existing CORS deployment identity", async () => {
  const current = config();
  const first = await current.generateBuildId();
  const second = await current.generateBuildId();
  for (const id of [first, second]) {
    assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    assert.doesNotMatch(id, /ad/i);
  }
  assert.notEqual(first, second);
  assert.equal(current.deploymentId, "jectstore-cors-v1-20261028");
  assert.equal(await current.headers(), headers);
  assert.equal(current.typescript.ignoreBuildErrors, false);
  assert.equal(current.crossOrigin, "anonymous");
  assert.equal(current.experimental.serverActions.bodySizeLimit, "2mb");
});

test("the installed Next build helper uses the configured generator rather than a constant fallback", async () => {
  const { generateBuildId } = await import("next/dist/build/generate-build-id.js");
  const current = config(() => "12345678-1234-4234-8234-123456789012");
  assert.equal(await generateBuildId(current.generateBuildId, () => { throw new Error("Fallback must not run"); }),
    "12345678-1234-4234-8234-123456789012");
});

test("ad-blocker-sensitive IDs are retried, with a bounded failure before any artifact can activate", async () => {
  let calls = 0;
  const current = config(() => ++calls === 1 ? "adadadad-1234-4234-8234-123456789012" : "12345678-1234-4234-8234-123456789012");
  assert.equal(await current.generateBuildId(), "12345678-1234-4234-8234-123456789012");
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(config(() => { calls++; return "adadadad-1234-4234-8234-123456789012"; }).generateBuildId(),
    /unambiguous release ID/);
  assert.equal(calls, 16);
});
