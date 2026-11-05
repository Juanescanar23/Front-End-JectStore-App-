import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { Accordion, AccordionItem } from "@heroui/accordion";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const stepperFile = "src/components/checkout/stepper/index.tsx";
const summaryFile = "src/components/checkout/checkout-cart/CartItemAccordian.tsx";
const read = (file) => readFileSync(path.join(root, file), "utf8");
const interop = (value) => ({ __esModule: true, default: value });
const classes = (node) => new Set((node.props.className || "").split(/\s+/));
const children = (node) => React.Children.toArray(node.props.children);
function load(file, dependencies, globals = {}) {
  const output = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const fixture = { exports: {} };
  vm.runInNewContext(output, { module: fixture, exports: fixture.exports,
    process: { env: { SITE_NAME: "Synthetic fixture" } }, URLSearchParams, ...globals,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return fixture.exports.default;
}
const stepDeps = {
  react: React, "react/jsx-runtime": jsx,
  "next/link": interop(({ children, ...props }) => React.createElement("a", props, children)),
  "@components/common/icons/LogoIcon": interop(() => React.createElement("svg")),
  "./Email": interop(() => null), "./GuestAddAdressForm": { GuestAddAdressForm: () => null },
  "./shipping": interop(() => null), "./payment": interop(() => null), "./review": interop(() => null),
};
const cart = {
  grandTotal: "12", subtotal: "12", shippingAmount: "0",
  items: { edges: [{ node: { name: "SYNTHETIC-ONLY", sku: "FIXTURE", productUrlKey: "fixture",
    quantity: 1, price: "12", baseImage: "/image/placeholder.webp" } }] },
};
function summary({ expanded, counters = { timers: 0, scrolls: 0 } } = {}) {
  const Component = load(summaryFile, {
    "react/jsx-runtime": jsx,
    "@/utils/constants": { DEFAULT_OPTION: "Default" },
    "@utils/constants": { NOT_IMAGE: "/image/placeholder.webp" },
    "@/utils/hooks/useScrollTo": { useScrollTo: () => () => { counters.scrolls++; } },
    "@utils/cart/normalize": { resolveCartItemImage: () => "/image/placeholder.webp" },
    "@components/theme/ui/Price": { Price: ({ amount, ...props }) => React.createElement("span", props, amount) },
    "@heroui/accordion": {
      Accordion: expanded === undefined ? Accordion : (props) => React.createElement(Accordion, {
        ...props, defaultSelectedKeys: expanded ? ["1"] : [],
      }),
      AccordionItem,
    },
    "@heroicons/react/24/outline": {
      ChevronLeftIcon: (props) => React.createElement("svg", props),
      ChevronRightIcon: (props) => React.createElement("svg", props),
    },
    "@utils/helper": { createUrl: (url) => url },
    "next/image": interop((props) => React.createElement("img", props)),
    "next/link": interop(({ children, ...props }) => React.createElement("a", props, children)),
  }, {
    setTimeout(callback) { counters.timers++; callback(); },
    document: { body: { scrollHeight: 9000 } },
  });
  return { tree: Component({ cartItems: cart }), counters };
}

test("mobile step body uses document flow while desktop retains its existing bounded scroll", () => {
  const Stepper = load(stepperFile, stepDeps);
  const html = renderToStaticMarkup(React.createElement(Stepper, {
    currentStep: "address", isOpen: true, setIsOpen() {},
  }));
  const paneClass = html.match(/<\/header><div class="([^"]*)"/)?.[1];
  assert.ok(paneClass, "Header stays before the step body in DOM order");
  const pane = new Set(paneClass.split(/\s+/));
  assert.ok(pane.has("lg:h-[calc(100dvh-190px)]"));
  assert.ok(pane.has("lg:overflow-y-auto"));
  assert.ok(!pane.has("overflow-y-auto"));
  assert.ok(![...pane].some((value) => /^h-/.test(value)), "No bounded mobile step height");
  assert.match(html, /class="flex lg:h-full flex-col gap-y-5 px-0 sm:px-1"/);
  assert.doesNotMatch(html.match(/<header[\s\S]*?<\/header>/)?.[0] || "", /class="[^"]*\b(?:sticky|fixed)\b/);
});

test("mobile document reserves the collapsed summary and safe area without changing desktop spacing", () => {
  const source = read("src/app/(checkout)/layout.tsx");
  assert.ok(source.includes("pb-[calc(env(safe-area-inset-bottom)+6rem)]"));
  assert.ok(source.includes("lg:pb-12"));
  assert.doesNotMatch(source, /overflow-(?:y-auto|hidden)|h-\[calc\(100/);
});

test("mobile summary removes the extra 56px while retaining safe area, content and accessible trigger", () => {
  const { tree } = summary();
  assert.ok(classes(tree).has("pb-[env(safe-area-inset-bottom)]"));
  assert.ok(classes(tree).has("fixed"));
  assert.ok(classes(tree).has("bottom-0"));
  assert.ok(classes(tree).has("lg:hidden"));
  assert.doesNotMatch(tree.props.className, /56px/);
  const accordion = children(tree)[0], item = children(accordion)[0];
  assert.equal(item.props.title, "Resumen del pedido");
  assert.equal(item.props["aria-label"], "Resumen del pedido");
  assert.ok(item.props.classNames.content.includes("max-h-[60vh]"));
  assert.ok(item.props.classNames.content.includes("supports-[height:100dvh]:max-h-[60dvh]"));
  assert.ok(item.props.classNames.content.includes("overflow-y-auto"));
  assert.ok(item.props.classNames.content.includes("overscroll-contain"));
  assert.ok(item.props.classNames.trigger.includes("focus-visible:outline-sf-focus"));
  assert.ok(!/\bpy-2\b|h-\[|max-h-/.test(item.props.classNames.trigger), "Keep the native trigger height");
});

test("opening or closing the summary cannot schedule a page jump or override HeroUI selection state", () => {
  const { tree, counters } = summary();
  const accordion = children(tree)[0];
  accordion.props.onSelectionChange?.(new Set(["1"]));
  accordion.props.onSelectionChange?.(new Set());
  assert.equal(counters.timers, 0);
  assert.equal(counters.scrolls, 0);
  assert.equal(accordion.props.onSelectionChange, undefined);
  assert.equal(accordion.props.selectionMode, "multiple");
  for (const prop of ["selectedKeys", "defaultSelectedKeys", "isDisabled"]) {
    assert.equal(accordion.props[prop], undefined, "Leave toggling state with HeroUI");
  }
  assert.doesNotMatch(read(summaryFile), /useScrollTo|scrollTo|scrollHeight|setTimeout/);
});

test("real HeroUI can render the same summary both closed and expanded with synthetic content", () => {
  const closed = renderToStaticMarkup(summary({ expanded: false }).tree);
  const expanded = renderToStaticMarkup(summary({ expanded: true }).tree);
  assert.match(closed, /aria-expanded="false"/);
  assert.match(expanded, /aria-expanded="true"/);
  for (const html of [closed, expanded]) {
    assert.match(html, /Resumen del pedido/);
    assert.match(html, /<button\b/);
    assert.doesNotMatch(html, /\bdisabled=""/);
  }
  assert.match(expanded, /SYNTHETIC-ONLY/);
  assert.match(expanded, /Subtotal/);
  assert.match(expanded, />Total<\/p>/);
});

test("real Tailwind compiles desktop-only body overflow and mobile summary vh/dvh fallback", async () => {
  const file = path.join(root, "src/app/globals.css");
  const result = await postcss([tailwind({ base: root, optimize: true })]).process(readFileSync(file, "utf8"), { from: file });
  const css = postcss.parse(result.css), declarations = [];
  css.walkRules((rule) => rule.walkDecls((decl) => {
    if (["overflow-y", "max-height", "padding-bottom"].includes(decl.prop)) {
      const conditions = [];
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type === "atrule") conditions.push(`@${parent.name} ${parent.params}`);
      }
      declarations.push({ selector: rule.selector, prop: decl.prop, value: decl.value, conditions });
    }
  }));
  const desktopScroll = declarations.find((entry) => entry.selector === ".lg\\:overflow-y-auto" && entry.value === "auto");
  assert.ok(desktopScroll?.conditions.includes("@media (min-width:1024px)"));
  assert.ok(declarations.some((entry) => entry.prop === "max-height" && entry.value === "60vh"));
  assert.ok(declarations.some((entry) => entry.prop === "max-height" && entry.value === "60dvh"
    && entry.conditions.some((condition) => /^@supports/.test(condition))));
  assert.ok(declarations.some((entry) => entry.prop === "padding-bottom" && /safe-area-inset-bottom/.test(entry.value) && !/56px/.test(entry.value)));
});
