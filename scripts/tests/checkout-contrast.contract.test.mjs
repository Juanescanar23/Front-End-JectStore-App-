import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import clsx from "clsx";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import ts from "typescript";
import * as React from "react";
import * as reactJsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as hookForm from "react-hook-form";
import * as hero from "@heroui/react";

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

function load(file, dependencies, exportName = "default") {
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
  return exportName === null ? fixture.exports : fixture.exports[exportName];
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
      assert.ok(tokens(panel[0]).has("text-neutral-900"), "Unstyled checkout summaries must inherit dark ink from the white panel, not the dark page");
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

const formSource = "src/components/checkout/stepper/GuestAddAdressForm.tsx";
const checkboxSource = "src/components/theme/ui/element/Checkbox.tsx";
const sharedReact = { "react/jsx-runtime": reactJsx, react: React, clsx: { default: clsx, __esModule: true } };
const inputComponent = load(inputFile, { ...sharedReact,
  "@heroicons/react/24/outline": { ExclamationCircleIcon: "svg" },
  "@/utils/type-guards": { isArray: Array.isArray },
});
const checkboxComponent = load(checkboxSource, sharedReact);
const proceedComponent = load("src/components/checkout/stepper/ProceedToCheckout.tsx", { ...sharedReact,
  "react-dom": { useFormStatus: () => ({ pending: false }) },
  "@components/common/icons/LoadingDots": { default: "span", __esModule: true },
}, "ProceedToCheckout");
const locationHelpers = load("src/utils/checkout-address-location.ts", {}, null);
const address = { firstName: "Nombre de prueba", lastName: "Apellido", companyName: "Empresa de prueba", email: "qa@example.invalid", address: "Dirección de prueba", city: "Bogotá", state: "DC", country: "CO", postcode: "110111", phone: "2025550143" };
const interop = (component) => ({ default: component, __esModule: true });

function checkoutComponent(file, { email = "qa@example.invalid", open, pending = false } = {}) {
  return load(file, {
    ...sharedReact,
    react: { ...React, useState: (initial) => React.useState(typeof initial === "boolean" && open !== undefined ? open : initial) },
    "react-hook-form": hookForm,
    "@heroui/react": hero,
    "react-redux": { useDispatch: () => () => {} },
    "next/link": interop(({ children, ...props }) => React.createElement("a", props, children)),
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/store/local-storage": { EMAIL: "email", getLocalStorage: () => email, setLocalStorage() {} },
    "@/store/slices/cart-slice": { setCheckoutAddresses: (value) => value },
    "@/utils/type-guards": { isObject: (value) => Boolean(value) && typeof value === "object" },
    "@utils/helper": { delay: async () => {} },
    "@/utils/constants": { IS_VALID_ADDRESS: /./, IS_VALID_PHONE: /./, IS_VALID_INPUT: /./ },
    "@utils/constants": { EMAIL_REGEX: /./ },
    "@/utils/checkout-address-location": locationHelpers,
    "@components/common/form/Input": interop(inputComponent),
    "@components/theme/ui/element/Checkbox": interop(checkboxComponent),
    "./ProceedToCheckout": { ProceedToCheckout: proceedComponent },
    "../ProceedToCheckout": { ProceedToCheckout: proceedComponent },
    "@utils/hooks/useToast": { useCustomToast: () => ({ showToast() {} }) },
    "@utils/hooks/useCheckout": { useCheckout: () => ({ isSaving: pending, isPaymentLoading: pending, isPlaceOrder: pending, isLoadingToSave: pending }) },
  }, file === formSource ? "GuestAddAdressForm" : "default");
}

function htmlFor(file, props, options) {
  const Component = checkoutComponent(file, options);
  return renderToStaticMarkup(React.createElement(Component, props));
}

function assertLightTextRoles(html) {
  // Shared text inputs retain their own dark utility: the enclosing panel's
  // stronger, already-tested input rule intentionally handles those controls.
  const withoutInputs = html.replace(/<input\b[^>]*>/g, "");
  assert.doesNotMatch(withoutInputs, /dark:text-(?:white(?:\/60)?|neutral-300|gray-400)\b/, "A white checkout surface must not apply dark-page text roles");
}

test("readonly email, address, shipping, payment and review summaries keep readable light-surface roles", () => {
  const fixtures = [
    ["src/components/checkout/stepper/Email.tsx", {}],
    [formSource, { billingAddress: address, shippingAddress: address }],
    ["src/components/checkout/stepper/shipping/ShippingMethod.tsx", { selectedShippingRate: "free_free", shippingMethod: [{ code: "free", method: "free_free", label: "Envío de prueba", price: "0" }] }],
    ["src/components/checkout/stepper/payment/PaymentMethod.tsx", { selectedPayment: "cashondelivery", isOpen: false, setIsOpen() {}, methods: [{ method: "cashondelivery", title: "Contraentrega de prueba" }] }],
    ["src/components/checkout/stepper/review/OrderReview.tsx", { shippingAddress: address, billingAddress: address, selectedShippingRateTitle: "Envío de prueba", selectedPaymentTitle: "Contraentrega de prueba" }],
  ];
  for (const [file, props] of fixtures) assertLightTextRoles(htmlFor(file, props));
});

test("real HeroUI radio markup preserves selection/disabled states with explicit readable label and description slots", () => {
  for (const pending of [false, true]) {
    const shipping = htmlFor("src/components/checkout/stepper/shipping/ShippingMethod.tsx", {
      selectedShippingRate: "free_free",
      shippingMethod: [{ code: "free", method: "free_free", label: "Envío de prueba", price: "0" }, { code: "other", method: "other", label: "Otro envío", price: "12" }],
    }, { open: false, pending });
    const payment = htmlFor("src/components/checkout/stepper/payment/PaymentMethod.tsx", {
      selectedPayment: "cashondelivery", isOpen: true, setIsOpen() {},
      methods: [{ method: "cashondelivery", title: "Contraentrega de prueba", description: "Pago de prueba" }, { method: "unavailable", title: "Pago no disponible", helperMessage: "No disponible de prueba", disabled: true }],
    }, { pending });
    for (const html of [shipping, payment]) {
      assertLightTextRoles(html);
      assert.match(html, /data-selected="true"/);
      assert.match(html, /class="[^"]*text-neutral-700[^"]*"/);
      assert.match(html, /class="[^"]*text-neutral-600[^"]*"/, "The real Radio description slot needs its own fixed-surface color");
      assert.doesNotMatch(html, /\btext-foreground(?:-400)?\b/, "Radio text must not inherit dark-page semantic colors");
      assert.match(html, /<button[^>]*class="[^"]*bg-blue-600[^"]*text-white[^"]*"/);
      if (pending) assert.match(html, /Procesando\.\.\./);
      assert.match(html, /bg-primary text-primary-foreground/, "Keep the radio indicator's authored colors");
    }
    assert.match(payment, /data-disabled="true"/);
    assert.match(payment, /disabled=""/);
    assert.match(payment, /Pago no disponible/);
  }
});

test("checkout checkbox opts into a readable label while shared defaults and the white checked glyph remain unchanged", () => {
  const defaultHtml = renderToStaticMarkup(React.createElement(checkboxComponent, { id: "outside", name: "outside", label: "Fuera del checkout", defaultValue: true }));
  assert.match(defaultHtml, /class="ml-3 text-neutral-400 dark:text-white"/);
  const form = htmlFor(formSource, {}, { email: "qa@example.invalid" });
  assert.match(form, /class="ml-3 text-neutral-700"/, "Only checkout opts into the light-surface label");
  assert.match(form, /text-white opacity-0 peer-checked:opacity-100/, "Keep the checked glyph white on blue");
  assert.match(form, /checked:bg-blue-600/);
  assert.match(form, /checked=""/);
  assert.doesNotMatch(form, /labelClassName=/, "The presentation prop must not leak onto the native input");
  assertLightTextRoles(form);
  assertLightTextRoles(htmlFor("src/components/checkout/stepper/Email.tsx", {}, { email: "" }));
});

test("pending order review keeps dark data text and an explicit white-on-blue action", () => {
  const html = htmlFor("src/components/checkout/stepper/review/OrderReview.tsx", { shippingAddress: address, billingAddress: address }, { pending: true });
  assertLightTextRoles(html);
  assert.match(html, /text-gray-900/);
  assert.match(html, /<button[^>]*class="[^"]*bg-blue-600[^"]*text-white[^"]*"/);
  assert.match(html, /Procesando\.\.\./);
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
  for (const shade of [600, 700, 900]) {
    assert.deepEqual(declarations(`.text-neutral-${shade}`), [
      { property: "color", value: `var(--color-neutral-${shade})`, important: false },
    ]);
  }
  assert.deepEqual(declarations(".text-white"), [
    { property: "color", value: "var(--color-white)", important: false },
  ]);
});
