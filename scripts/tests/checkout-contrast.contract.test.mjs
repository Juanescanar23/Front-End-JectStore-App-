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
import * as reactQuery from "@tanstack/react-query";

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

function load(file, dependencies, exportName = "default", globals = {}) {
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
    URLSearchParams,
    ...globals,
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
    react: { useState: (value) => [value, () => {}], useEffect() {}, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    "@/store/hooks": { useAppSelector: () => ({ cart: {} }) },
    "../common/skeleton/CheckoutSkeleton": { default: "CheckoutSkeleton", __esModule: true },
    "../common/skeleton/ProductCartSkeleton": { CartSkeleton: "CartSkeleton" },
    "@/utils/hooks/useCartDetail": { useCartDetail: () => ({ isLoading }) },
    "./checkout-cart/CheckoutCart": { default: "CheckoutCart", __esModule: true },
    "./stepper": { default: "Stepper", __esModule: true },
    "@utils/helper": { useAddressesFromApi: () => ({ billingAddress: null, shippingAddress: null }) },
    "@/utils/hooks/useScrollTo": { useScrollToTop() {} },
    "./checkout-theme.css": {},
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

test("checkout uses an opt-in themed surface without descendant color overrides or geometry changes", () => {
  for (const step of ["email", "address", "shipping", "payment", "review"]) {
    for (const loading of [false, true]) {
      const tree = checkout(step, loading);
      const panel = nodes(tree, (node) => tokens(node).has("bg-sf-surface"));
      assert.equal(panel.length, 1);
      assert.ok(tokens(panel[0]).has("text-sf-content"));
      assert.ok(tokens(tree).has("sf-checkout"), "Text selection is scoped to the checkout boundary");
      assert.equal(nodes(tree, (node) => tokens(node).has(inputContrast)).length, 0);
      for (const unchanged of ["rounded-[28px]", "px-4", "py-4", "sm:px-6", "lg:px-8"]) {
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

test("surface inputs associate their accessible name, errors and autocomplete without masking autofill", () => {
  for (const [name, autoComplete] of [["email", "email"], ["billing.firstName", "section-billing given-name"], ["shipping.phone", "section-shipping tel"]]) {
    for (const state of [{}, { errorMsg: "Revisa este campo" }, { disabled: true }, { readOnly: true }]) {
      const tree = input({ name, label: "Campo", tone: "surface", autoComplete, "aria-describedby": "help", ...state });
      const field = nodes(tree, (node) => node.type === "input")[0];
      assert.equal(nodes(tree, (node) => node.type === "label" && node.props.htmlFor === field.props.id).length, 1);
      assert.equal(field.props.autoComplete, autoComplete);
      assert.equal(field.props.disabled, state.disabled);
      assert.equal(field.props.readOnly, state.readOnly);
      for (const role of ["bg-sf-surface", "text-sf-content", "caret-sf-content", "placeholder:text-sf-placeholder", "focus:ring-sf-focus", "disabled:bg-sf-subtle"]) assert.ok(tokens(field).has(role), role);
      assert.equal(field.props["aria-describedby"], state.errorMsg ? `help ${name}-error` : "help");
      assert.equal(field.props["aria-invalid"], state.errorMsg ? true : undefined);
      if (state.errorMsg) {
        assert.equal(nodes(tree, (node) => node.props.id === `${name}-error` && node.props.role === "alert").length, 1);
        assert.ok(tokens(field).has("border-sf-error"));
        assert.ok(!tokens(field).has("enabled:hover:border-sf-control-hover"), "Hover cannot hide an error border");
      }
      assert.ok(!tokens(field).has("dark:text-white"));
      assert.ok(!tokens(field).has("placeholder-input-color"));
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

function checkoutComponent(file, { email = "qa@example.invalid", open, pending = false, formControl } = {}) {
  return load(file, {
    ...sharedReact,
    react: { ...React, useState: (initial) => React.useState(typeof initial === "boolean" && open !== undefined ? open : initial) },
    "react-hook-form": formControl ? { ...hookForm, useForm: () => ({ ...formControl, formState: { errors: {}, isSubmitting: false } }) } : hookForm,
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

// React's SSR renderer uses getServerSnapshot, as does the first hydration
// render. The client-phase fixture selects getSnapshot explicitly; browser
// hydration itself is verified separately by the native-browser QA gate.
function hydrationMarkup({ phase = "server", guest = false, email = null, cached = false, blockedStorage = false } = {}) {
  const reads = { storage: 0, upstream: 0, writes: 0 };
  const proof = "synthetic-offline-cart-proof";
  const envelope = encodeURIComponent(`${Buffer.from("{}").toString("base64")}.${Buffer.from(encodeURIComponent(JSON.stringify({ sessionToken: proof }))).toString("base64")}.guest`);
  const globals = phase === "server" ? {} : {
    window: {},
    document: { get cookie() { if (blockedStorage) throw new Error("Storage unavailable"); return guest ? `guest_cart_token=${envelope}; is_guest=true` : ""; } },
    localStorage: {
      getItem() { reads.storage++; if (blockedStorage) throw new Error("Storage unavailable"); return email; },
      setItem() { reads.writes++; },
    },
    console: { error() {} },
  };
  const guards = load("src/utils/type-guards.ts", {}, null);
  const storage = load("src/store/local-storage.ts", { "@/utils/type-guards": guards }, null, globals);
  const jwt = load("src/utils/jwt-cookie.ts", {}, null, { atob, btoa });
  const token = load("src/utils/getCartToken.ts", {
    "@/utils/constants": { GUEST_CART_TOKEN: "guest_cart_token", IS_GUEST: "is_guest" },
    "@/utils/jwt-cookie": jwt,
  }, null, globals);
  const noFetch = { fetchHandler() { reads.upstream++; throw new Error("Network is forbidden in this fixture"); } };
  const useCartDetail = load("src/utils/hooks/useCartDetail.ts", {
    react: React, "@tanstack/react-query": reactQuery,
    "@/store/hooks": { useAppDispatch: () => () => { reads.writes++; } },
    "../fetch-handler": noFetch,
    "@/store/slices/cart-slice": { addItem: (value) => value },
    "@utils/type-guards": guards,
    "@utils/getCartToken": token,
    "@utils/cart/normalize": { resolveReadCartPayload: (value) => value },
  }, "useCartDetail");
  const useAddress = load("src/utils/useAddress.ts", {
    "@tanstack/react-query": reactQuery,
    "./getCartToken": token,
    "./fetch-handler": noFetch,
  }, "useAddress");
  const Email = load("src/components/checkout/stepper/Email.tsx", {
    ...sharedReact, "react-hook-form": hookForm,
    "next/navigation": { useRouter: () => ({ push() { reads.writes++; } }) },
    "@/store/local-storage": storage,
    "next/link": interop(({ children, ...props }) => React.createElement("a", props, children)),
    "@components/common/form/Input": interop(inputComponent),
    "./ProceedToCheckout": { ProceedToCheckout: proceedComponent },
    "@utils/helper": { delay: async () => {} },
    "@utils/constants": { EMAIL_REGEX: /.+@.+/ },
  }, "default", globals);
  const Stepper = load("src/components/checkout/stepper/index.tsx", {
    ...sharedReact,
    "next/link": interop(({ children, ...props }) => React.createElement("a", props, children)),
    "@components/common/icons/LogoIcon": interop(() => null),
    "./Email": interop(Email),
    "./GuestAddAdressForm": { GuestAddAdressForm: () => null },
    "./shipping": interop(() => null),
    "./payment": interop(() => null),
    "./review": interop(() => null),
  }, "default", { process: { env: { SITE_NAME: "Synthetic fixture" } } });
  const Skeleton = load("src/components/common/skeleton/CheckoutSkeleton.tsx", sharedReact);
  const CartSkeleton = load("src/components/common/skeleton/ProductCartSkeleton.tsx", {
    ...sharedReact, "./CheckoutSkeleton": interop(Skeleton),
  }, "CartSkeleton");
  const state = {};
  const Component = load(checkoutFile, {
    ...sharedReact,
    react: phase === "client" ? { ...React, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() } : React,
    "@/store/hooks": { useAppSelector: () => ({ cart: undefined }) },
    "../common/skeleton/CheckoutSkeleton": interop(Skeleton),
    "../common/skeleton/ProductCartSkeleton": { CartSkeleton },
    "@/utils/hooks/useCartDetail": { useCartDetail() { const result = useCartDetail(); state.isLoading = result.isLoading; return result; } },
    "./checkout-cart/CheckoutCart": interop(() => React.createElement("div", { "data-offline-summary": true })),
    "./stepper": interop(Stepper),
    "@utils/helper": { useAddressesFromApi() { useAddress(); return { billingAddress: null, shippingAddress: null }; } },
    "@/utils/hooks/useScrollTo": { useScrollToTop() {} },
    "./checkout-theme.css": {},
  });
  const client = new reactQuery.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  if (cached) client.setQueryData(["cart-detail", proof], { data: { id: "synthetic" } });
  const html = renderToStaticMarkup(React.createElement(reactQuery.QueryClientProvider, { client }, React.createElement(Component, { step: "email" })));
  client.clear();
  assert.equal(reads.upstream, 0);
  assert.equal(reads.writes, 0);
  return { html, reads, state };
}

test("SSR and initial hydration snapshots match with a cold guest cookie, no cookie, saved email or blocked storage", () => {
  const server = hydrationMarkup();
  assert.match(server.html, /Cargando\.\.\./);
  assert.doesNotMatch(server.html, /Finaliza tu compra|<form\b|>Cambiar<\/button>/);
  for (const scenario of [
    {}, { guest: true }, { email: "synthetic@example.invalid" },
    { guest: true, email: "synthetic@example.invalid" },
    { guest: true, cached: true, email: "synthetic@example.invalid" },
    { guest: true, blockedStorage: true },
  ]) {
    const firstClient = hydrationMarkup({ ...scenario, phase: "hydrating" });
    assert.equal(firstClient.html, server.html, JSON.stringify(scenario));
    assert.equal(firstClient.reads.storage, 0, "Email is not mounted until hydration finishes");
    assert.equal(firstClient.state.isLoading, Boolean(scenario.guest && !scenario.cached && !scenario.blockedStorage));
  }
});

test("after hydration the existing guest loading gate remains until cart data arrives", () => {
  const pending = hydrationMarkup({ phase: "client", guest: true, email: "synthetic@example.invalid" });
  assert.match(pending.html, /Cargando\.\.\./);
  assert.doesNotMatch(pending.html, /Finaliza tu compra|synthetic@example/);
  assert.equal(pending.reads.storage, 0);
  const ready = hydrationMarkup({ phase: "client", guest: true, cached: true, email: "synthetic@example.invalid" });
  assert.match(ready.html, /Finaliza tu compra/);
  assert.match(ready.html, /synthetic@example.invalid/);
  assert.doesNotMatch(ready.html, /<form\b|Cargando\.\.\./);
});

test("after hydration absent email keeps its existing form and saved email keeps its summary without a storage write", () => {
  for (const scenario of [{}, { blockedStorage: true }, { guest: true, cached: true }]) {
    const empty = hydrationMarkup({ ...scenario, phase: "client" });
    assert.match(empty.html, /<form\b/);
    assert.match(empty.html, /<input[^>]*name="email"/);
    assert.doesNotMatch(empty.html, />Cambiar<\/button>/);
  }
  const saved = hydrationMarkup({ phase: "client", email: "synthetic@example.invalid" });
  assert.match(saved.html, /synthetic@example.invalid/);
  assert.match(saved.html, />Cambiar<\/button>/);
  assert.doesNotMatch(saved.html, /<form\b/);
});

function assertSurfaceTextRoles(html) {
  assert.doesNotMatch(html, /dark:text-(?:white(?:\/60)?|neutral-300|gray-400)\b/, "Checkout controls declare paired surface roles, not dark-page color overrides");
  assert.doesNotMatch(html, /\btext-(?:gray-900|neutral-700|black\/60)\b/);
}

test("readonly email, address, shipping, payment and review summaries use the same themed text roles", () => {
  const fixtures = [
    ["src/components/checkout/stepper/Email.tsx", {}],
    [formSource, { billingAddress: address, shippingAddress: address }],
    ["src/components/checkout/stepper/shipping/ShippingMethod.tsx", { selectedShippingRate: "free_free", shippingMethod: [{ code: "free", method: "free_free", label: "Envío de prueba", price: "0" }] }],
    ["src/components/checkout/stepper/payment/PaymentMethod.tsx", { selectedPayment: "cashondelivery", isOpen: false, setIsOpen() {}, methods: [{ method: "cashondelivery", title: "Contraentrega de prueba" }] }],
    ["src/components/checkout/stepper/review/OrderReview.tsx", { shippingAddress: address, billingAddress: address, selectedShippingRateTitle: "Envío de prueba", selectedPaymentTitle: "Contraentrega de prueba" }],
  ];
  for (const [file, props] of fixtures) {
    const html = htmlFor(file, props);
    assertSurfaceTextRoles(html);
    assert.match(html, /text-sf-(?:content|muted)/);
  }
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
      assertSurfaceTextRoles(html);
      assert.match(html, /data-selected="true"/);
      assert.match(html, /class="[^"]*text-sf-muted[^"]*"/);
      assert.match(html, /data-\[selected=true\]:bg-sf-selected-bg/);
      assert.match(html, /data-\[hover=true\]:bg-sf-subtle/);
      assert.match(html, /group-data-\[focus-visible=true\]:ring-sf-focus/);
      assert.doesNotMatch(html, /\btext-foreground(?:-400)?\b/, "Radio text must not inherit dark-page semantic colors");
      assert.match(html, /<button[^>]*class="[^"]*bg-sf-action[^"]*text-sf-action-content[^"]*"/);
      if (pending) {
        assert.match(html, /<button[^>]*disabled=""/);
        assert.match(html, /Procesando\.\.\./);
      }
      assert.match(html, /bg-sf-selected-border/, "The indicator remains visible against the selected background");
    }
    assert.match(payment, /data-disabled="true"/);
    assert.match(payment, /disabled=""/);
    assert.match(payment, /Pago no disponible/);
  }
});

test("real HeroUI and RHF keep empty shipping/payment radios keyboard reachable without selecting an option", () => {
  const shipping = [{ code: "free", method: "free_free", label: "Envío de prueba", price: "0" }, { code: "other", method: "other", label: "Otro envío", price: "12" }];
  const fixtures = [
    ["src/components/checkout/stepper/shipping/ShippingMethod.tsx", { shippingMethod: shipping }, { open: false }, "free_free"],
    ["src/components/checkout/stepper/shipping/ShippingMethod.tsx", { shippingMethod: shipping, selectedShippingRate: "free_free" }, { open: false }, "free_free"],
    ["src/components/checkout/stepper/payment/PaymentMethod.tsx", { isOpen: true, setIsOpen() {}, methods: [
      { method: "cashondelivery", title: "Contraentrega de prueba" },
      { method: "unavailable", title: "No disponible", disabled: true },
      { method: "other", title: "Otro método de prueba" },
    ] }, {}, "cashondelivery"],
  ];
  const radios = (html) => [...html.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)].map(([tag]) => ({
    value: /\bvalue="([^"]*)"/.exec(tag)?.[1],
    tabIndex: /\btabindex="([^"]*)"/.exec(tag)?.[1],
    checked: /\bchecked=""/.test(tag), disabled: /\bdisabled=""/.test(tag),
  }));
  for (const [file, props, options, selected] of fixtures) {
    const formControl = hookForm.createFormControl({ defaultValues: { method: "" } });
    formControl.register("method");
    for (const value of ["", selected, ""]) {
      // Exercise the real form reset, including clearing an earlier selection.
      formControl.reset({ method: value });
      const inputs = radios(htmlFor(file, props, { ...options, formControl }));
      const enabled = inputs.filter((input) => !input.disabled);
      assert.ok(enabled.length > 0);
      assert.ok(enabled.some((input) => input.tabIndex === "0"), `${file}: keyboard entry for ${JSON.stringify(value)}`);
      assert.equal(inputs.filter((input) => input.checked).length, value ? 1 : 0, "Never auto-select the first option");
      assert.equal(formControl.getValues().method, value, "Radio normalization must not rewrite RHF state");
      if (value) {
        assert.equal(enabled.find((input) => input.value === value)?.tabIndex, "0");
        assert.ok(enabled.filter((input) => input.value !== value).every((input) => input.tabIndex === "-1"));
      }
      assert.ok(inputs.filter((input) => input.disabled).every((input) => input.tabIndex !== "0" && !input.checked));
    }
    assert.doesNotMatch(readFileSync(path.join(root, file), "utf8"), /\btabIndex\s*=/, "Leave roving focus to the real radio library");
  }
});

test("checkout checkbox opts into a readable label while shared defaults and the white checked glyph remain unchanged", () => {
  const defaultHtml = renderToStaticMarkup(React.createElement(checkboxComponent, { id: "outside", name: "outside", label: "Fuera del checkout", defaultValue: true }));
  assert.match(defaultHtml, /class="ml-3 text-neutral-400 dark:text-white"/);
  const form = htmlFor(formSource, {}, { email: "qa@example.invalid" });
  assert.match(form, /<label[^>]*class="ml-3 text-sf-content"/, "Only checkout opts into themed labels");
  assert.match(form, /text-white opacity-0 peer-checked:opacity-100/, "Keep the checked glyph white on blue");
  assert.match(form, /checked:bg-sf-action/);
  assert.match(form, /checked=""/);
  assert.doesNotMatch(form, /labelClassName=/, "The presentation prop must not leak onto the native input");
  assertSurfaceTextRoles(form);
  assertSurfaceTextRoles(htmlFor("src/components/checkout/stepper/Email.tsx", {}, { email: "" }));
});

test("pending order review keeps themed data text and a natively disabled white-on-blue action", () => {
  const html = htmlFor("src/components/checkout/stepper/review/OrderReview.tsx", { shippingAddress: address, billingAddress: address }, { pending: true });
  assertSurfaceTextRoles(html);
  assert.match(html, /text-sf-content/);
  assert.match(html, /<button[^>]*disabled=""[^>]*class="[^"]*bg-sf-action[^"]*text-sf-action-content[^"]*"/);
  assert.match(html, /Procesando\.\.\./);
});

test("both parent pending and form pending natively disable Proceed without changing the action name", () => {
  for (const parentPending of [false, true]) for (const formPending of [false, true]) {
    const Proceed = load("src/components/checkout/stepper/ProceedToCheckout.tsx", { ...sharedReact,
      "react-dom": { useFormStatus: () => ({ pending: formPending }) },
      "@components/common/icons/LoadingDots": interop(() => React.createElement("span", { "data-loading": "true" })),
    }, "ProceedToCheckout");
    const html = renderToStaticMarkup(React.createElement(Proceed, { pending: parentPending, buttonName: "Siguiente" }));
    assert.match(html, /type="submit"/);
    assert.match(html, /aria-label="Siguiente"/);
    assert.equal(/ disabled=""/.test(html), parentPending || formPending);
    assert.equal(/aria-busy="true"/.test(html), parentPending || formPending);
    assert.match(html, /enabled:hover:bg-sf-action-hover/);
    assert.match(html, /enabled:active:bg-sf-action-active/);
    assert.match(html, /focus-visible:outline-sf-focus/);
    assert.doesNotMatch(html, /disabledClasses/);
  }
});

test("desktop and real HeroUI mobile summary keep paired surfaces, text and keyboard focus", () => {
  const money = load("src/utils/storefront-money.ts", {}, null);
  const currency = load("src/providers/StorefrontCurrencyProvider.tsx", {
    ...sharedReact, "@/utils/storefront-money": money,
  }, null);
  const prices = load("src/components/theme/ui/Price.tsx", {
    ...sharedReact, "@/utils/storefront-money": money, "@/providers/StorefrontCurrencyProvider": currency,
  }, "Price");
  const deps = { ...sharedReact,
    "@/utils/constants": { DEFAULT_OPTION: "Default" },
    "@utils/constants": { NOT_IMAGE: "/image/placeholder.webp" },
    "@/utils/hooks/useScrollTo": { useScrollTo: () => () => {} },
    "@utils/cart/normalize": { resolveCartItemImage: () => "/image/placeholder.webp" },
    "@components/theme/ui/Price": { Price: prices },
    "@heroui/accordion": { Accordion: hero.Accordion, AccordionItem: hero.AccordionItem },
    "@heroicons/react/24/outline": { ChevronLeftIcon: "svg", ChevronRightIcon: "svg" },
    "@utils/helper": { createUrl: (url) => url },
    "next/image": interop((props) => React.createElement("img", props)),
    "next/link": interop(({ children, ...props }) => React.createElement("a", props, children)),
    "@components/theme/ui/grid/Tile": { GridTileImage: (props) => React.createElement("img", props) },
  };
  const Mobile = load("src/components/checkout/checkout-cart/CartItemAccordian.tsx", deps);
  const Desktop = load("src/components/checkout/checkout-cart/CheckoutCart.tsx", { ...deps, "./CartItemAccordian": interop(Mobile) });
  const cartItems = { items: { edges: [{ node: { name: "Producto de prueba", productUrlKey: "fixture", sku: "FIXTURE", quantity: 1, total: "12", baseImage: "/image/placeholder.webp" } }] }, grandTotal: "12", subTotal: "12" };
  const html = renderToStaticMarkup(React.createElement(currency.StorefrontCurrencyProvider, { currencyCode: "USD" }, React.createElement(Desktop, { cartItems })));
  assertSurfaceTextRoles(html);
  assert.match(html, /bg-sf-surface\/95/);
  assert.match(html, /<h2[^>]*class="[^"]*sticky top-0 z-50 bg-sf-surface px-4/);
  assert.match(html, /focus-visible:outline-sf-focus/);
  assert.match(html, /Resumen del pedido/);
  assert.match(html, /Producto de prueba/);
  assert.doesNotMatch(html, /mobile-heading|\bbg-white(?:\/95)?\b/);
  for (const geometry of ["fixed bottom-0 left-0 z-50", "rounded-[28px]", "lg:hidden", "hidden lg:block"]) assert.ok(html.includes(geometry), geometry);
});

let compiled;
async function compiledStyles() {
  if (!compiled) {
    const file = path.join(root, "src/app/globals.css");
    compiled = postcss([tailwind({ base: root, optimize: true })]).process(readFileSync(file, "utf8"), { from: file }).then((result) => postcss.parse(result.css));
  }
  return compiled;
}

test("real Tailwind CSS resolves semantic controls without a descendant override or global restyle", async () => {
  const css = await compiledStyles();
  const selector = ".dark\\:\\[\\&_input\\]\\:text-gray-900:is(.dark *) input";
  const declarations = (wanted) => {
    const found = [];
    css.walkRules((rule) => {
      if (rule.selectors.includes(wanted)) {
        rule.walkDecls((decl) => found.push({ property: decl.prop, value: decl.value, important: Boolean(decl.important) }));
      }
    });
    return found;
  };
  assert.deepEqual(declarations(selector), []);
  assert.deepEqual(declarations(".text-sf-content"), [{ property: "color", value: "var(--sf-content)", important: false }]);
  assert.deepEqual(declarations(".bg-sf-surface"), [{ property: "background-color", value: "var(--sf-surface)", important: false }]);
  assert.deepEqual(declarations(".placeholder\\:text-sf-placeholder::placeholder"), [{ property: "color", value: "var(--sf-placeholder)", important: false }]);
  assert.deepEqual(declarations(".caret-sf-content"), [{ property: "caret-color", value: "var(--sf-content)", important: false }]);
  assert.deepEqual(declarations(".dark\\:text-white:is(.dark *)"), [
    { property: "color", value: "var(--color-white)", important: false },
  ]);
  assert.deepEqual(declarations(".text-white"), [
    { property: "color", value: "var(--color-white)", important: false },
  ]);
});

function themeVariables(css, theme) {
  const variables = {};
  for (const selectors of [[":root", ":host"], [`.${theme}`]]) css.walkRules((rule) => {
    if (rule.selectors.some((selector) => selectors.includes(selector))) rule.walkDecls((decl) => {
      if (decl.prop.startsWith("--")) variables[decl.prop] = decl.value;
    });
  });
  return variables;
}

function color(value, variables, seen = new Set()) {
  const resolved = value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    assert.ok(!seen.has(name), `Circular token ${name}`);
    assert.ok(Object.hasOwn(variables, name), `Missing token ${name}`);
    return variables[name];
  });
  if (resolved !== value) return color(resolved, variables, new Set([...seen, value]));
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join("") : hex[1];
    return [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16) / 255);
  }
  const hsl = /^hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)$/.exec(value);
  if (hsl) {
    const h = Number(hsl[1]), s = Number(hsl[2]) / 100, l = Number(hsl[3]) / 100;
    const a = s * Math.min(l, 1 - l);
    return [0, 8, 4].map((n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); });
  }
  const oklch = /^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (oklch) {
    const l = Number(oklch[1]) / 100, c = Number(oklch[2]), h = Number(oklch[3]) * Math.PI / 180;
    const a = c * Math.cos(h), b = c * Math.sin(h);
    const ll = (l + .3963377774 * a + .2158037573 * b) ** 3;
    const mm = (l - .1055613458 * a - .0638541728 * b) ** 3;
    const ss = (l - .0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * ll - 3.3077115913 * mm + .2309699292 * ss,
      -1.2684380046 * ll + 2.6097574011 * mm - .3413193965 * ss,
      -.0041960863 * ll - .7034186147 * mm + 1.707614701 * ss]
      .map((linear) => Math.min(1, Math.max(0, linear <= .0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - .055)));
  }
  assert.fail(`Unsupported compiled color ${value}`);
}
function contrast(first, second) {
  const luminance = (rgb) => rgb.map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

test("compiled light and dark roles meet contrast for text, controls, selected options, focus and text selection", async () => {
  const css = await compiledStyles();
  assert.equal(contrast([0, 0, 0], [1, 1, 1]), 21);
  for (const theme of ["light", "dark"]) {
    const variables = themeVariables(css, theme);
    const ratio = (foreground, background, minimum) => {
      const actual = contrast(color(`var(--sf-${foreground})`, variables), color(`var(--sf-${background})`, variables));
      assert.ok(actual >= minimum, `${theme} ${foreground}/${background}: ${actual.toFixed(2)} must be >= ${minimum}`);
    };
    for (const surface of ["surface", "subtle", "selected-bg"]) for (const foreground of ["content", "muted"]) ratio(foreground, surface, 4.5);
    for (const foreground of ["placeholder", "error", "link", "link-hover"]) ratio(foreground, "surface", 4.5);
    for (const surface of ["surface", "subtle"]) for (const foreground of ["control-border", "control-hover", "focus"]) ratio(foreground, surface, 3);
    ratio("selected-border", "selected-bg", 3);
    ratio("selection-content", "selection-bg", 4.5);
    for (const action of ["action", "action-hover", "action-active"]) ratio("action-content", action, 4.5);
    assert.equal(variables["--sf-action"], "var(--color-blue-600)", "Keep the existing CTA blue");
  }
});

test("decorative borders preserve the real HeroUI divider alpha while control borders stay opaque", async () => {
  const css = await compiledStyles();
  let nativeDivider;
  css.walkRules((rule) => {
    if (rule.selectors.includes(".border-divider")) rule.walkDecls("border-color", (decl) => { nativeDivider = decl.value; });
  });
  assert.ok(nativeDivider, "The actual HeroUI divider utility must be compiled");
  const compact = (value) => value.replace(/\s/g, "").replace(/\/0\./g, "/.");
  for (const theme of ["light", "dark"]) {
    const variables = themeVariables(css, theme);
    assert.equal(compact(variables["--sf-border"]), compact(nativeDivider), `${theme}: preserve channels AND alpha`);
    assert.match(variables["--sf-border"], /\/\s*0?\.15\)/);
    assert.equal(variables["--sf-control-border"], "hsl(var(--heroui-default-500))");
    assert.ok(contrast(color("var(--sf-control-border)", variables), color("var(--sf-surface)", variables)) >= 3);
  }
});

test("selection is checkout-scoped and autofill is left to the coherent native color scheme", () => {
  const sheet = postcss.parse(readFileSync(path.join(root, "src/components/checkout/checkout-theme.css"), "utf8"));
  const selectors = [];
  sheet.walkRules((rule) => selectors.push(...rule.selectors));
  assert.deepEqual(selectors, [".sf-checkout::selection", ".sf-checkout ::selection"]);
  sheet.walkDecls((decl) => {
    assert.equal(Boolean(decl.important), false);
    assert.ok(["background-color", "color"].includes(decl.prop));
    assert.match(decl.value, /^var\(--sf-selection-/);
  });
  for (const file of [inputFile, "src/components/checkout/checkout-theme.css"]) {
    assert.doesNotMatch(readFileSync(path.join(root, file), "utf8"), /-webkit-text-fill-color|autofill|1000px|!important/);
  }
  const provider = readFileSync(path.join(root, "src/providers/ThemeProvider.tsx"), "utf8");
  assert.match(provider, /attribute="class"/);
  assert.doesNotMatch(provider, /enableColorScheme=\{false\}/);
  assert.match(readFileSync(path.join(root, "src/components/checkout/stepper/Email.tsx"), "utf8"), /autoComplete="email"/);
  for (const field of ["given-name", "family-name", "street-address", "postal-code", "tel"]) {
    const source = readFileSync(path.join(root, formSource), "utf8");
    assert.ok(source.includes(`section-billing ${field}`));
    assert.ok(source.includes(`section-shipping ${field}`));
  }
});
