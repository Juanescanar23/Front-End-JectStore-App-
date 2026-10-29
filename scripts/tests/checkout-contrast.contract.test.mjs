import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import clsx from "clsx";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const checkoutFile = "src/components/checkout/index.tsx";
const inputFile = "src/components/common/form/Input.tsx";
const inputContrast = "dark:[&_input]:text-gray-900";
const element = (type, props) => ({ type, props: props || {} });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const nodes = (tree, predicate) => {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
};
const tokens = (node) => new Set((node.props.className || "").split(/\s+/));

function load(file, dependencies) {
  const source = readFileSync(path.join(root, file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const fixture = { exports: {} };
  vm.runInNewContext(compiled, {
    module: fixture,
    exports: fixture.exports,
    require: (id) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
      return dependencies[id];
    },
  });
  return fixture.exports.default;
}

function checkout(step, isLoading = false) {
  const component = load(checkoutFile, {
    "react/jsx-runtime": jsx,
    react: { useState: (value) => [value, () => {}], useEffect() {} },
    "@/store/hooks": { useAppSelector: () => ({ cart: {} }) },
    "../common/skeleton/CheckoutSkeleton": { default: "CheckoutSkeleton", __esModule: true },
    "../common/skeleton/ProductCartSkeleton": { CartSkeleton: "CartSkeleton" },
    "@/utils/hooks/useCartDetail": { useCartDetail: () => ({ isLoading }) },
    "./checkout-cart/CheckoutCart": { default: "CheckoutCart", __esModule: true },
    "./stepper": { default: "Stepper", __esModule: true },
    "@utils/helper": { useAddressesFromApi: () => ({ billingAddress: null, shippingAddress: null }) },
    "@/utils/hooks/useScrollTo": { useScrollToTop() {} },
  });
  return component({ step });
}

const input = load(inputFile, {
  "react/jsx-runtime": jsx,
  react: { forwardRef: (render) => render },
  clsx: { default: clsx, __esModule: true },
  "@heroicons/react/24/outline": { ExclamationCircleIcon: "ExclamationCircleIcon" },
  "@/utils/type-guards": { isArray: Array.isArray },
});

test("checkout keeps its white card and limits the dark input correction to that card", () => {
  for (const step of ["email", "address", "shipping", "payment", "review"]) {
    for (const loading of [false, true]) {
      const tree = checkout(step, loading);
      const panel = nodes(tree, (node) => tokens(node).has("bg-white"));
      assert.equal(panel.length, 1);
      assert.ok(tokens(panel[0]).has(inputContrast), "The white checkout card must retain readable input text in dark mode");
      assert.equal(nodes(tree, (node) => tokens(node).has(inputContrast)).length, 1);
      for (const unchanged of ["rounded-[28px]", "border-neutral-200", "px-4", "py-4", "sm:px-6", "lg:px-8"]) {
        assert.ok(tokens(panel[0]).has(unchanged), `Preserve checkout presentation: ${unchanged}`);
      }
      assert.equal(nodes(panel[0], (node) => node.type === (loading ? "CheckoutSkeleton" : "Stepper")).length, 1);
      assert.equal(nodes(panel[0], (node) => node.type === "CheckoutCart").length, 0);
    }
  }
});

test("shared inputs retain outside-checkout dark styling, validation, focus and typed values", () => {
  for (const name of ["email", "billing.firstName", "billing.phone", "shipping.firstName"]) {
    for (const errorMsg of [undefined, "Revisa este campo"]) {
      const tree = input({ name, label: "Campo", defaultValue: "Texto escrito", size: "md", readOnly: true, errorMsg });
      const field = nodes(tree, (node) => node.type === "input")[0];
      for (const unchanged of ["bg-transparent", "text-gray-900", "dark:text-white", "focus:ring-2", "focus:ring-blue-500", "placeholder-input-color", "dark:placeholder-selected-color-dark", "text-base"]) {
        assert.ok(tokens(field).has(unchanged), `Preserve shared input behavior: ${unchanged}`);
      }
      assert.ok(tokens(field).has(errorMsg ? "border-red-500" : "border-gray-300"));
      assert.equal(field.props.defaultValue, "Texto escrito");
      assert.equal(field.props.name, name);
      assert.equal(field.props.readOnly, true);
      assert.equal(nodes(tree, (node) => tokens(node).has(inputContrast)).length, 0);
    }
  }
});

test("real Tailwind CSS gives only checkout descendant inputs a more specific dark color rule", async () => {
  const file = path.join(root, "src/app/globals.css");
  const result = await postcss([tailwind({ base: root, optimize: true })]).process(readFileSync(file, "utf8"), { from: file });
  const css = postcss.parse(result.css);
  const escapeClass = (value) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  const selector = `.${escapeClass(inputContrast)}:is(.dark *) input`;
  const declarations = (wanted) => {
    const found = [];
    css.walkRules((rule) => {
      if (rule.selectors.includes(wanted)) {
        rule.walkDecls((decl) => found.push({ property: decl.prop, value: decl.value, important: Boolean(decl.important) }));
      }
    });
    return found;
  };
  // The descendant input adds type specificity to the same class + dark
  // condition used by dark:text-white. No !important or global input rule.
  assert.deepEqual(declarations(selector), [
    { property: "color", value: "var(--color-gray-900)", important: false },
  ]);
  assert.deepEqual(declarations(".text-gray-900"), [
    { property: "color", value: "var(--color-gray-900)", important: false },
  ]);
  assert.deepEqual(declarations(".dark\\:text-white:is(.dark *)"), [
    { property: "color", value: "var(--color-white)", important: false },
  ]);
});
