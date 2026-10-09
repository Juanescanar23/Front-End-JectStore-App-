import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/utils/jwt-cookie.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const envelopeModule = { exports: {} };
new Function("exports", output)(envelopeModule.exports);
const { encodeJWT, decodeJWT } = envelopeModule.exports;

test("guest envelope round-trips Unicode without embedding an authentication secret", () => {
  const payload = { sessionToken: "fixture-cart-token", cartId: 2, name: "México" };
  const encoded = encodeJWT(payload);
  assert.deepEqual(decodeJWT(encoded), payload);
  const parts = decodeURIComponent(encoded).split(".");
  assert.deepEqual(JSON.parse(atob(parts[0])), { alg: "none", typ: "JWT" });
  assert.equal(parts[2], "guest");
  assert.doesNotMatch(source, /NEXT_AUTH_SECRET|NEXTAUTH_SECRET/);
});

test("retains legacy guest envelope compatibility and non-guest raw tokens", () => {
  const encoded = encodeJWT({ sessionToken: "fixture-cart-token" });
  const parts = decodeURIComponent(encoded).split(".");
  parts[2] = "legacy-public-marker";
  assert.deepEqual(decodeJWT(encodeURIComponent(parts.join("."))), { sessionToken: "fixture-cart-token" });
  assert.deepEqual(decodeJWT("raw-customer-token", false), { sessionToken: "raw-customer-token" });
  assert.equal(decodeJWT("invalid-envelope"), null);
});
