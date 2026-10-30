import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const element = (type, props, key) => ({ type, key, props: props || {} });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const children = (tree, predicate) => {
  if (Array.isArray(tree)) return tree.flatMap((node) => children(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...children(tree.props?.children, predicate)];
};
const text = (tree) => typeof tree === "string" ? tree
  : Array.isArray(tree) ? tree.map(text).join("") : tree && typeof tree === "object" ? text(tree.props?.children) : "";
function load(file, dependencies = {}) {
  const source = readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const fixture = { exports: {} };
  vm.runInNewContext(output, { module: fixture, exports: fixture.exports,
    process: { env: { SITE_NAME: "Synthetic fixture" } },
    require: (name) => {
      if (name === "react/jsx-runtime") return jsx;
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return fixture.exports;
}
const helpers = load("src/utils/checkout-address-location.ts");
const guest = load("src/components/checkout/stepper/GuestAddAdressForm.tsx", {
  react: { useState: (value) => [value, () => {}], useEffect() {} },
  "react-hook-form": {
    useForm: ({ defaultValues }) => ({ control: defaultValues, register: (name) => ({ name, onChange() {} }), handleSubmit: (fn) => fn, formState: { errors: {} } }),
    useWatch: ({ control, name, defaultValue }) => name.split(".").reduce((value, key) => value?.[key], control) ?? defaultValue,
  },
  "@/store/local-storage": { EMAIL: "email", getLocalStorage: () => "synthetic@fixture.invalid" },
  "@/utils/constants": { IS_VALID_ADDRESS: /.*/, IS_VALID_PHONE: /^\d{10}$/, IS_VALID_INPUT: /.*/ },
  "@/utils/type-guards": { isObject: (value) => value !== null && typeof value === "object" },
  "@utils/hooks/useCheckout": { useCheckout: () => ({ isLoadingToSave: false }) },
  "@components/common/form/Input": { __esModule: true, default: "InputText" },
  "./ProceedToCheckout": { ProceedToCheckout: "ProceedToCheckout" },
  "@components/theme/ui/element/Checkbox": { __esModule: true, default: "CheckBox" },
  "react-redux": { useDispatch: () => () => {} },
  "@/store/slices/cart-slice": { setCheckoutAddresses: (value) => value },
  "@/utils/checkout-address-location": helpers,
}).GuestAddAdressForm;
const stepper = load("src/components/checkout/stepper/index.tsx", {
  react: { useMemo: (callback) => callback() },
  "next/link": { __esModule: true, default: "Link" },
  "@components/common/icons/LogoIcon": { __esModule: true, default: "LogoIcon" },
  "./Email": { __esModule: true, default: "Email" },
  "./GuestAddAdressForm": { GuestAddAdressForm: guest },
  "./shipping": { __esModule: true, default: "Shipping" },
  "./payment": { __esModule: true, default: "Payment" },
  "./review": { __esModule: true, default: "Review" },
}).default;
const address = { firstName: "DEMO", lastName: "TEST ONLY", companyName: "", address: "NO DELIVERY", city: "DEMO CITY", state: "DC", country: "CO", postcode: "000000", phone: "0000000000", email: "synthetic@fixture.invalid" };
const render = (currentStep, saved = false) => stepper({
  currentStep, billingAddress: saved ? address : null, shippingAddress: saved ? address : null,
  selectedPayment: null, isOpen: true, setIsOpen() {},
});
const steps = (tree) => children(tree, (node) => typeof node.type === "function" && node.props.step);

test("step component identity and keys remain stable across navigation and server cart refreshes", () => {
  const before = steps(render("address"));
  const after = steps(render("shipping", true));
  const refreshed = steps(render("payment", true));
  assert.equal(before.length, 5);
  for (let index = 0; index < 5; index++) {
    assert.equal(before[index].type, after[index].type, "A new inner component type would discard all descendant React state");
    assert.equal(after[index].type, refreshed[index].type);
    assert.equal(before[index].key, after[index].key);
    assert.equal(before[index].props.step.key, after[index].props.step.key);
  }
});

test("completed steps keep summary mounting and geometry while surfaces follow the checkout theme", () => {
  for (const [current, completed] of [["email", 1], ["address", 2], ["shipping", 3], ["payment", 4], ["review", 5]]) {
    const rows = steps(render(current, true));
    for (const row of rows) {
      const card = row.type(row.props);
      for (const token of ["rounded-[26px]", "border-sf-border", "bg-sf-surface/80", "p-4", "sm:p-5"]) {
        assert.ok(card.props.className.includes(token));
      }
      assert.equal(children(card, (node) => node.type === "section").length, row.props.step.id <= completed ? 1 : 0);
    }
  }
});

test("saved cart address props render the real Guest summary after remount, not blank controls", () => {
  const row = steps(render("shipping", true)).find((entry) => entry.props.step.key === "address");
  const formElement = row.props.step.component;
  const tree = formElement.type(formElement.props);
  assert.match(text(tree), /DEMO/);
  assert.match(text(tree), /NO DELIVERY/);
  assert.match(text(tree), /Dirección de facturación/);
  assert.match(text(tree), /Dirección de envío/);
  assert.equal(children(tree, (node) => node.type === "form" || node.type === "InputText").length, 0);
  const unsaved = guest({ billingAddress: null, shippingAddress: null });
  assert.equal(children(unsaved, (node) => node.type === "form").length, 1);
  assert.ok(children(unsaved, (node) => node.type === "InputText").length > 0);
});
