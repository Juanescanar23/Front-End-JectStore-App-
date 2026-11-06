import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const jsx = (type, props) => ({ type, props: props || {} });
const interop = (value) => ({ default: value, __esModule: true });
const constants = ts.createSourceFile("constants.ts", readFileSync(path.join(root, "src/utils/constants.ts"), "utf8"), ts.ScriptTarget.Latest, true);
let emailPattern;
const findEmailPattern = (node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(constants) === "EMAIL_REGEX") {
    emailPattern = new Function(`return ${node.initializer.getText(constants)}`)();
  }
  ts.forEachChild(node, findEmailPattern);
};
findEmailPattern(constants);
assert.ok(emailPattern instanceof RegExp);
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  if (!tree || typeof tree !== "object") return [];
  if (typeof tree.type === "function") return nodes(tree.type(tree.props), type);
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props.children, type)];
}
function load(file, dependencies) {
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function("require", "module", "exports", output)((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports.default;
}
function contact({ saved = "owner@example.com", pending = false } = {}) {
  const writes = [], routes = [], registered = {};
  let open = false;
  const state = { errors: {}, isSubmitting: pending };
  const Email = load("src/components/checkout/stepper/Email.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState: () => [open, (value) => { open = value; }] },
    "react-hook-form": { useForm: (options) => ({
      register: (name, rules) => { registered[name] = rules; return { name, defaultValue: options.defaultValues[name] }; },
      handleSubmit: (submit) => async (values) => {
        const rules = registered.email;
        if (!values.email || !rules.pattern.value.test(values.email)) return;
        return submit(values);
      },
      formState: state,
    }) },
    "@/utils/checkout-step": { updateCheckoutStep: (...args) => routes.push(args) },
    "@/store/local-storage": { EMAIL: "email", getLocalStorage: () => saved, setLocalStorage: (...args) => writes.push(args) },
    "next/link": interop("Link"),
    "@components/common/form/Input": interop("InputText"),
    "./ProceedToCheckout": { ProceedToCheckout: "ProceedToCheckout" },
    "@utils/helper": { delay: async () => {} },
    "@utils/constants": { EMAIL_REGEX: emailPattern },
  });
  return { render: (isCurrentStep) => Email({ isCurrentStep }), writes, routes, registered };
}

test("saved email on the active step renders the existing prefilled validated form and exactly one continuation", async () => {
  const h = contact();
  const tree = h.render(true);
  const input = nodes(tree, "InputText")[0];
  assert.ok(input, "Saved contact cannot strand the current checkout step");
  assert.equal(input.props.defaultValue, "owner@example.com");
  assert.equal(input.props.autoComplete, "email");
  assert.equal(input.props.tone, "surface");
  assert.equal(nodes(tree, "ProceedToCheckout").length, 1);
  assert.equal(nodes(tree, "ProceedToCheckout")[0].props.buttonName, "Siguiente");
  assert.equal(h.registered.email.required, "El correo es obligatorio");
  assert.equal(h.registered.email.pattern.message, "Ingresa un correo válido");
  assert.deepEqual(h.writes, []);
  const form = nodes(tree, "form")[0];
  await form.props.onSubmit({ email: "invalid" });
  assert.deepEqual(h.routes, []);
  await form.props.onSubmit({ email: "owner@example.com" });
  assert.deepEqual(h.writes, [["email", "owner@example.com"]]);
  assert.deepEqual(h.routes, [["address", "push"]]);
});

test("completed saved contact stays a summary, while Cambiar retains the original edit form", () => {
  const h = contact();
  const summary = h.render(false);
  assert.equal(nodes(summary, "ProceedToCheckout").length, 0);
  assert.equal(nodes(summary, "InputText").length, 0);
  nodes(summary, "button")[0].props.onClick();
  assert.equal(nodes(h.render(false), "ProceedToCheckout").length, 1);
});

test("active contact preserves the shared submit pending state and a missing email still opens the form", () => {
  assert.equal(nodes(contact({ pending: true }).render(true), "ProceedToCheckout")[0].props.pending, true);
  assert.equal(nodes(contact({ saved: null }).render(false), "InputText").length, 1);
});

test("the actual stepper supplies current-step state to contact and memoizes against navigation", () => {
  const source = readFileSync(path.join(root, "src/components/checkout/stepper/index.tsx"), "utf8");
  assert.match(source, /<Email\s+isCurrentStep=\{currentStep === "email"\}\s*\/>/);
  assert.match(source, /\},\s*\[[\s\S]*?\bcurrentStep\b[\s\S]*?\]\);/);
});

test("payment selection names its action honestly and retains shared busy handling", () => {
  const source = readFileSync(path.join(root, "src/components/checkout/stepper/payment/PaymentMethod.tsx"), "utf8");
  assert.match(source, /buttonName="Continuar"/);
  assert.doesNotMatch(source, /buttonName="Pagar ahora"/);
  assert.match(source, /pending=\{isPaymentLoading \|\| isSubmitting\}/);
});

test("the actual payment handler rejects removed or disabled methods without a save or advance", async () => {
  const file = "src/components/checkout/stepper/payment/PaymentMethod.tsx";
  const source = ts.createSourceFile(file, readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let submit;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "onSubmit") submit = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(submit);
  const output = ts.transpileModule(`return (${submit.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const methods of [[], [{ method: "cashondelivery", disabled: true, helperMessage: "Disponibilidad sin confirmar." }]]) {
    const notices = [], saves = [], advances = [];
    const action = new Function("isPaymentLoading", "methods", "showToast", "saveCheckoutPayment", "setIsOpen", output)(
      false, methods, (...args) => notices.push(args), (value) => saves.push(value), (value) => advances.push(value),
    );
    await action({ method: "cashondelivery" });
    assert.deepEqual(saves, []);
    assert.deepEqual(advances, []);
    assert.equal(notices.length, 1);
  }
});
