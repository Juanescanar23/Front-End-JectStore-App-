import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const source = (relative) => readFileSync(path.join(root, relative), "utf8");
function evaluate(text, scope = {}) {
  const output = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function(...Object.keys(scope), "exports", output)(...Object.values(scope), exports);
  return exports;
}
function arrow(relative, variable, scope) {
  const file = ts.createSourceFile(relative, source(relative), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === variable) initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(initializer && ts.isArrowFunction(initializer), `Missing real ${variable}`);
  return evaluate(`exports.action = ${initializer.getText(file)}`, scope).action;
}
const guard = () => evaluate(source("src/utils/checkout-submit.ts")).createCheckoutSubmissionGuard();
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((pass, fail) => { resolve = pass; reject = fail; });
  return { promise, resolve, reject };
};

test("UI submission shares only the in-flight action and permits an explicit retry after settlement", async () => {
  const run = guard(), pending = deferred();
  let calls = 0;
  const callback = () => { calls++; return pending.promise; };
  const first = run("address", callback), duplicate = run("address", callback);
  assert.equal(first, duplicate);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(await run("shipping", async () => "independent"), "independent");
  pending.resolve("saved");
  assert.equal(await first, "saved");
  assert.equal(await duplicate, "saved");
  assert.equal(await run("address", async () => { calls++; return "retry"; }), "retry");
  assert.equal(calls, 2);
});

test("failed and synchronously thrown UI submissions release the guard without suppressing errors", async () => {
  for (const synchronous of [false, true]) {
    const run = guard(), failure = new Error("synthetic failure");
    const callback = () => { if (synchronous) throw failure; return Promise.reject(failure); };
    const first = run("payment", callback), duplicate = run("payment", callback);
    assert.equal(first, duplicate);
    await assert.rejects(first, (error) => error === failure);
    await assert.rejects(duplicate, (error) => error === failure);
    assert.equal(await run("payment", async () => "retried"), "retried");
  }
});

test("actual checkout hook actions return the upstream result and deduplicate a synchronous double submission", async () => {
  const cases = [
    ["saveCheckoutAddress", "saveAddressToCheckout", { billingCountry: "CO" }, { token: "synthetic", billingCountry: "CO" }],
    ["saveCheckoutShipping", "saveShipping", "free_free", { token: "synthetic", shippingMethod: "free_free" }],
    ["saveCheckoutPayment", "savePayment", "cashondelivery", { token: "synthetic", paymentMethod: "cashondelivery" }],
    ["SavePlaceOrder", "placeOrder", undefined, { token: "synthetic" }],
  ];
  for (const [name, mutation, input, expected] of cases) {
    const pending = deferred(), payloads = [], result = { synthetic: name };
    const action = arrow("src/utils/hooks/useCheckout.ts", name, {
      submitOnce: guard(), getCartToken: () => "synthetic", getCookie: () => "false", IS_GUEST: "fixture-guest",
      resetGuestToken: () => assert.fail("No guest token rotation in this test"),
      [mutation]: (payload) => { payloads.push(payload); return pending.promise; },
    });
    let settled = false;
    const first = action(input).then((value) => { settled = true; return value; });
    const duplicate = action(input);
    await Promise.resolve();
    assert.deepEqual(payloads, [expected], name);
    assert.equal(settled, false, `${name} must await the mutation`);
    pending.resolve(result);
    assert.equal(await first, result);
    assert.equal(await duplicate, result);
  }
});

test("actual review submit remains pending through the parent promise and busy submissions cannot reach the order callback", async () => {
  for (const busy of [false, true]) {
    const pending = deferred();
    let calls = 0, settled = false;
    const action = arrow("src/components/checkout/stepper/review/OrderReview.tsx", "onSubmit", {
      isPlaceOrder: busy, SavePlaceOrder: () => { calls++; return pending.promise; },
    });
    const result = action().then((value) => { settled = true; return value; });
    await Promise.resolve();
    assert.equal(calls, busy ? 0 : 1);
    assert.equal(settled, busy);
    pending.resolve("synthetic result");
    assert.equal(await result, busy ? undefined : "synthetic result");
  }
});

test("actual address, shipping and payment busy handlers cannot invoke their mutation callbacks", async () => {
  for (const flag of ["isLoadingToSave", "locationsLoading", "locationsError"]) {
    const action = arrow("src/components/checkout/stepper/GuestAddAdressForm.tsx", "addGuestAddress", {
      isLoadingToSave: false, locationsLoading: false, locationsError: false, [flag]: true,
      saveCheckoutAddress: () => assert.fail("Busy address must not submit"),
    });
    assert.equal(await action({}), undefined);
  }
  for (const [file, flag, callback] of [["shipping/ShippingMethod.tsx", "isSaving", "saveCheckoutShipping"], ["payment/PaymentMethod.tsx", "isPaymentLoading", "saveCheckoutPayment"]]) {
    const action = arrow(`src/components/checkout/stepper/${file}`, "onSubmit", {
      [flag]: true, [callback]: () => assert.fail("Busy method must not submit"),
    });
    assert.equal(await action({ method: "synthetic" }), undefined);
  }
});
