import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const target = "src/components/checkout/stepper/index.tsx";
const source = readFileSync(path.join(root, target), "utf8");
const fixture = (name) => function StepFixture() {
  return React.createElement("span", { "data-step-fixture": name });
};
const interop = (value) => ({ __esModule: true, default: value });
const dependencies = {
  react: React,
  "react/jsx-runtime": jsx,
  "next/link": interop(({ children, ...props }) => React.createElement("a", props, children)),
  "@components/common/icons/LogoIcon": interop(() => React.createElement("svg", { "aria-hidden": true })),
  "./Email": interop(fixture("email")),
  "./GuestAddAdressForm": { GuestAddAdressForm: fixture("address") },
  "./shipping": interop(fixture("shipping")),
  "./payment": interop(fixture("payment")),
  "./review": interop(fixture("review")),
};
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const moduleFixture = { exports: {} };
vm.runInNewContext(compiled, {
  module: moduleFixture, exports: moduleFixture.exports, process: { env: { SITE_NAME: "Synthetic fixture" } },
  require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  },
});
const Stepper = moduleFixture.exports.default;
const render = (currentStep = "email", theme = "light") => renderToStaticMarkup(
  React.createElement("div", { className: theme }, React.createElement(Stepper, {
    currentStep, billingAddress: null, shippingAddress: null,
    selectedPayment: null, selectedShippingRate: null,
    isOpen: true, setIsOpen() {},
  })),
);
const headerFrom = (html) => {
  const match = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/);
  assert.ok(match, "The existing semantic header must remain");
  return match[0];
};
const plainText = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

test("real checkout header has no boxed background or radius in either theme, without changing its geometry", () => {
  for (const theme of ["light", "dark"]) {
    const header = headerFrom(render("email", theme));
    const wrapper = header.match(/<div\b([^>]*)>/);
    assert.ok(wrapper);
    const classes = wrapper[1].match(/\bclass="([^"]*)"/)?.[1];
    assert.equal(classes, "mt-3 px-4 py-5 sm:px-5 lg:px-0 lg:py-0");
    assert.doesNotMatch(classes, /(?:^|\s)(?:[^\s:]+:)*(?:bg-|rounded|border|shadow)/);
    assert.doesNotMatch(wrapper[1], /\bstyle=/);
    assert.match(header, /^<header class="pb-6">/);
    assert.match(header, /class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"/);
  }
});

test("heading semantics, copy, type and home-link behavior remain unchanged", () => {
  const header = headerFrom(render());
  assert.equal([...header.matchAll(/<h1\b/g)].length, 1);
  assert.match(header, /<h1 class="mt-2 text-2xl font-semibold text-sf-content sm:text-3xl">Finaliza tu compra<\/h1>/);
  assert.match(plainText(header), /CheckoutFinaliza tu compra/);
  assert.match(plainText(header), /Completa tus datos de contacto, envío y pago\. Puedes retomar el paso actual sin perder el progreso\./);
  assert.match(header, /<a aria-label="Synthetic fixture" class="hidden items-center gap-2 text-sf-content md:pt-1 lg:flex" href="\/">/);
});

test("the Paso badge and existing step cards preserve their surface, state and mounting contract", () => {
  const states = ["email", "address", "shipping", "payment", "review", "unknown"];
  for (const theme of ["light", "dark"]) {
    for (const currentStep of states) {
      const completed = Math.max(states.indexOf(currentStep) < 5 ? states.indexOf(currentStep) + 1 : 1, 1);
      const html = render(currentStep, theme);
      const header = headerFrom(html);
      assert.match(header, /class="inline-flex w-fit items-center rounded-full bg-sf-surface px-3 py-1.5 text-xs font-semibold text-sf-muted shadow-sm"/);
      assert.ok(plainText(header).endsWith(`Paso ${completed} de 5`));
      assert.equal([...html.matchAll(/class="rounded-\[26px\] border border-sf-border bg-sf-surface\/80 p-4 shadow-sm sm:p-5"/g)].length, 5);
      assert.equal([...html.matchAll(/<section class="relative mt-5 border-t border-sf-border pt-5">/g)].length, completed);
      assert.equal([...html.matchAll(/data-step-fixture=/g)].length, completed);
    }
  }
});
