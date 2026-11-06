import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../../src/utils/checkout-step.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(href) {
  const calls = [];
  const exports = {};
  const window = {location: {href}, history: {
    pushState: (...args) => calls.push(["push", ...args]),
    replaceState: (...args) => calls.push(["replace", ...args]),
  }};
  vm.runInNewContext(code, {URL, exports, window});
  return {...exports, calls};
}

test("switches steps on the current checkout and retains the other URL parameters", () => {
  const {updateCheckoutStep,calls} = fixture("https://local.test/checkout?source=cart#summary");
  updateCheckoutStep("address","push");
  updateCheckoutStep("review","replace");
  assert.deepEqual(calls,[
    ["push",null,"","/checkout?source=cart&step=address#summary"],
    ["replace",null,"","/checkout?source=cart&step=review#summary"],
  ]);
});

test("keeps other routes and the already active step unchanged", () => {
  for (const url of ["https://local.test/cart","https://local.test/checkout?step=address"]) {
    const {updateCheckoutStep,calls} = fixture(url);
    updateCheckoutStep("address","push");
    assert.equal(calls.length,0);
  }
});

test("normalizes malformed or absent steps to the contact form", () => {
  const {resolveCheckoutStep} = fixture("https://local.test/checkout");
  for (const value of [null, undefined, "", "unknown", "/success"]) assert.equal(resolveCheckoutStep(value),"email");
  for (const value of ["email", "address", "shipping", "payment", "review"]) assert.equal(resolveCheckoutStep(value),value);
});
