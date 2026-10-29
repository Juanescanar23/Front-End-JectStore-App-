import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const detailFile = "src/components/cart/OrderDetail.tsx";
const hookFile = "src/utils/hooks/useCheckout.ts";

test("actual order confirmation keeps its markup/styles and native cookie hydration without promising email", () => {
  let orderId = null;
  const effects = [], frames = [], reads = [];
  const dependencies = {
    "react/jsx-runtime": jsx,
    react: { useState: () => [orderId, (value) => { orderId = value; }], useEffect: (callback) => effects.push(callback) },
    "@/utils/constants": { ORDER_ID: "synthetic-order-cookie" },
    "@utils/getCartToken": { getCookie: (name) => { reads.push(name); return "37"; } },
  };
  const output = ts.transpileModule(readFileSync(path.join(root, detailFile), "utf8"), {
    fileName: detailFile, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const fixtureModule = { exports: {} };
  new Function("require", "module", "exports", "requestAnimationFrame", output)(
    (name) => { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; },
    fixtureModule, fixtureModule.exports, (callback) => frames.push(callback),
  );
  const render = () => renderToStaticMarkup(fixtureModule.exports.default());
  // Captures the incumbent native structure/classes, including its placeholder.
  const expected = (number) => `<div class="mb-8 font-outfit"><h1 class="my-2 text-center text-3xl font-semibold sm:text-4xl">Tu pedido <span class="text-primary">#${number}</span> se realizó correctamente</h1><p class="text-center text-lg font-normal text-black/60 dark:text-neutral-300">Guarda el número de tu pedido para futuras consultas.</p></div>`;
  assert.equal(render(), expected('<span class="animate-pulse">...</span>'));
  assert.deepEqual(reads, []);
  effects[0]();
  assert.deepEqual(reads, []);
  frames[0]();
  assert.deepEqual(reads, ["synthetic-order-cookie"]);
  assert.equal(render(), expected("37"));
});

function actualOrderSuccess(scope) {
  const source = ts.createSourceFile(hookFile, readFileSync(path.join(root, hookFile), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let callback;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source).includes("mutateAsync: placeOrder") && ts.isCallExpression(node.initializer)) {
      callback = node.initializer.arguments[0].properties.find((property) => property.name?.getText(source) === "onSuccess")?.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(callback && ts.isArrowFunction(callback));
  const output = ts.transpileModule(`return ${callback.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), output)(...Object.values(scope));
}

function orderFixture() {
  const calls = [];
  const callback = actualOrderSuccess({
    isObject: (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0,
    showToast: (...args) => calls.push(["toast", ...args]),
    setCookie: (...args) => calls.push(["cookie", ...args]), ORDER_ID: "synthetic-order-cookie",
    dispatch: (value) => calls.push(["dispatch", value]), clearCart: () => ({ type: "cart/clear" }),
    router: { replace: (value) => calls.push(["replace", value]) },
  });
  return { callback, calls };
}

test("actual native order callback uses Spanish success copy while preserving order ID, cart clear and success route", () => {
  const h = orderFixture();
  h.callback({ data: { createCheckoutOrder: { checkoutOrder: { orderId: "37" } } } });
  assert.deepEqual(h.calls, [
    ["toast", "Pedido realizado correctamente.", "success"],
    ["cookie", "synthetic-order-cookie", "37"],
    ["dispatch", { type: "cart/clear" }],
    ["replace", "/success"],
  ]);
});

test("order rejection retains its native warning and never emits the new success message or advances", () => {
  const h = orderFixture();
  h.callback({ error: { message: "Revisa los datos del pedido." } });
  assert.deepEqual(h.calls, [["toast", "Revisa los datos del pedido.", "warning"]]);
});
