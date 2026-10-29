import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import React from "react";
import { renderToPipeableStream } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");
const { getRequiredScripts } = require("next/dist/server/app-render/required-scripts");
const configModule = { exports: {} };
const configSource = ts.transpileModule(readFileSync(resolve(root, "next.config.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("require", "module", "exports", configSource)(
  name => {
    assert.equal(name, "@/utils/constants");
    return { configHeader: [] };
  }, configModule, configModule.exports,
);
const config = configModule.exports.default;

test("Next config requests anonymous scripts without an asset-identity workaround", () => {
  assert.equal(config.crossOrigin, "anonymous");
  assert.equal(config.deploymentId, undefined);
});

for (const integrity of [undefined, {
  "static/bootstrap.js": "sha256-bootstrap-fixture",
  "static/runtime.js": "sha256-runtime-fixture",
}]) {
  test(`installed Next and React carry anonymous mode to bootstrap, preinit and preload${integrity ? " with integrity" : ""}`, async () => {
    const [preinit, bootstrap] = getRequiredScripts(
      { rootMainFiles: ["static/bootstrap.js", "static/runtime.js"] },
      "", config.crossOrigin, integrity, "", undefined, "/fixture",
    );
    assert.equal(bootstrap.crossOrigin, "anonymous");
    function App() {
      preinit();
      return React.createElement("html", null, React.createElement("body", null, "Fixture"));
    }
    const html = await new Promise((resolve, reject) => {
      const output = new PassThrough();
      const chunks = [];
      output.on("data", chunk => chunks.push(chunk));
      output.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      output.on("error", reject);
      const stream = renderToPipeableStream(React.createElement(App), {
        bootstrapScripts: [bootstrap],
        onShellReady() { stream.pipe(output); },
        onError: reject,
      });
    });
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="[^"]+"[^>]*>/g)].map(match => match[0]);
    const preloads = [...html.matchAll(/<link\b[^>]*>/g)].map(match => match[0]).filter(tag => /\bas="script"/.test(tag));
    assert.equal(scripts.length, 2, "Both the actual bootstrap and preinit must be present");
    assert.ok(preloads.length > 0, "React must preload the bootstrap script");
    // React normalizes anonymous to an empty attribute. Absence is NOT equivalent.
    for (const tag of [...scripts, ...preloads]) assert.match(tag, /\bcrossorigin="(?:anonymous)?"/);
    assert.ok(scripts.some(tag => tag.includes("/_next/static/bootstrap.js")));
    assert.ok(scripts.some(tag => tag.includes("/_next/static/runtime.js")));
  });
}
