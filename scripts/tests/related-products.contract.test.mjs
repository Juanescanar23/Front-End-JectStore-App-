import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sourceRoot = resolve(process.env.HOMESTORE_NEXT_SOURCE || process.cwd());
const sectionPath = "src/components/catalog/product/ProductsSection.tsx";
const candidateFile = resolve(process.env.RELATED_PRODUCTS_SOURCE || resolve(sourceRoot, sectionPath));
const require = createRequire(resolve(sourceRoot, "package.json"));
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const jsxRuntime = require("react/jsx-runtime");
const sha = (value) => createHash("sha256").update(value).digest("hex");

function renderSection({ currency = "COP", products = [], sectionSource } = {}) {
  const buttons = [];
  const cards = [];
  const additions = [];
  const toasts = [];
  const executed = new Set();
  const cache = new Map();
  const capture = (factory) => (tag, props, ...args) => {
    if (tag === "button") buttons.push(props);
    if (typeof tag === "function" && tag.name === "ProductCard") cards.push({ key: args[0], product: props.product });
    return factory(tag, props, ...args);
  };
  const mocks = {
    "react/jsx-runtime": { ...jsxRuntime, jsx: capture(jsxRuntime.jsx), jsxs: capture(jsxRuntime.jsxs) },
    "next/link": { default: ({ href, prefetch, children, ...props }) => React.createElement("a", { ...props, href }, children) },
    "next/image": { default: ({ src, alt, className, width, height, loading }) => React.createElement("img", { src, alt, className, width, height, loading }) },
    "@utils/hooks/useAddToCart": { useAddProduct: () => ({ isCartLoading: false, onAddToCart: (payload) => additions.push(payload) }) },
    "@utils/hooks/useToast": { useCustomToast: () => ({ showToast: (...args) => toasts.push(args) }) },
    "@/store/hooks": { useAppSelector: (selector) => selector({ user: { user: null } }) },
  };
  function load(path) {
    const target = resolve(sourceRoot, path);
    const file = [target, target + ".ts", target + ".tsx"].find(existsSync);
    assert.ok(file, "Dependency exists: " + path);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const relative = file.slice(sourceRoot.length + 1);
    executed.add(relative);
    const source = relative === sectionPath ? (sectionSource ?? readFileSync(candidateFile, "utf8")) : readFileSync(file, "utf8");
    const output = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", output)((name) => {
      if (Object.hasOwn(mocks, name)) return Object.hasOwn(mocks[name], "default") ? { __esModule: true, ...mocks[name] } : mocks[name];
      if (name.startsWith(".")) return load(resolve(dirname(file), name));
      for (const [prefix, replacement] of [["@/", "src/"], ["@components/", "src/components/"], ["@utils/", "src/utils/"]]) {
        if (name.startsWith(prefix)) return load(replacement + name.slice(prefix.length));
      }
      return require(name);
    }, module, module.exports);
    return module.exports;
  }
  const { ProductsSection } = load(sectionPath);
  const { StorefrontCurrencyProvider } = load("src/providers/StorefrontCurrencyProvider.tsx");
  const html = renderToStaticMarkup(React.createElement(StorefrontCurrencyProvider, { currencyCode: currency },
    React.createElement(ProductsSection, { title: "Productos relacionados", description: "Descripción sintética", products })));
  return { html, buttons, cards, additions, toasts, executed };
}

const product = (changes = {}) => ({ id: "101", sku: "SKU-SYNTHETIC-101", type: "simple", urlKey: "bolso-local", name: "Bolso sintético", price: "3499000.0000", isSaleable: true, ...changes });
const prices = (html) => [...html.matchAll(/<p\b([^>]*)>([^<]*)<\/p>/g)].filter(([, attrs]) => attrs.includes("data-currency")).map(([, attrs, text]) => ({ currency: attrs.match(/data-currency="([^"]+)"/)[1], text }));

test("the real ProductCard, Price, AddToCartButton and scoped provider execute", () => {
  const result = renderSection({ products: [product()] });
  for (const path of ["src/components/catalog/product/ProductCard.tsx", "src/components/theme/ui/Price.tsx", "src/components/theme/ui/AddToCartButton.tsx", "src/providers/StorefrontCurrencyProvider.tsx", "src/utils/storefront-money.ts"]) assert.ok(result.executed.has(path), path);
  assert.equal(result.buttons.length, 2, "Existing desktop and mobile actions are preserved");
});

for (const currency of ["COP", "MXN", "ARS"]) {
  test(`related prices inherit channel ${currency}, preserving amount and formatting policy`, () => {
    const result = renderSection({ currency, products: [product()] });
    const expected = new Intl.NumberFormat(currency === "COP" ? "en-US" : undefined, {
      style: "currency", currency, currencyDisplay: "narrowSymbol",
      ...(currency === "COP" ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    }).format(3499000);
    assert.deepEqual(prices(result.html), [{ currency, text: expected }]);
    assert.ok(!result.html.includes('data-currency="USD"'));
    if (currency === "COP") assert.ok(!prices(result.html)[0].text.includes(".00"));
  });
}

for (const currency of [null, "???"]) {
  test(`unknown channel context ${String(currency)} never invents USD`, () => {
    const result = renderSection({ currency, products: [product()] });
    assert.deepEqual(prices(result.html), []);
    assert.match(result.html, /<p[^>]*>—<\/p>/);
    assert.doesNotMatch(result.html, /data-currency="USD"/);
  });
}

test("different requests keep currencies isolated without shared mutable state", () => {
  const cop = renderSection({ currency: "COP", products: [product()] });
  const mxn = renderSection({ currency: "MXN", products: [product()] });
  const unknown = renderSection({ currency: null, products: [product()] });
  assert.equal(prices(cop.html)[0].currency, "COP");
  assert.equal(prices(mxn.html)[0].currency, "MXN");
  assert.deepEqual(prices(unknown.html), []);
});

for (const isSaleable of [true, false, null, undefined]) {
  test(`real add-to-cart preserves isSaleable=${String(isSaleable)} without a true fallback`, () => {
    const result = renderSection({ products: [product({ isSaleable })] });
    assert.equal(result.buttons.length, 2);
    assert.equal(result.buttons[0]["aria-disabled"], isSaleable !== true);
    result.buttons[0].onClick();
    if (isSaleable === true) {
      assert.deepEqual(result.additions, [{ productId: "101", quantity: 1, token: undefined }]);
      assert.deepEqual(result.toasts, []);
    } else {
      assert.deepEqual(result.additions, []);
      assert.deepEqual(result.toasts, [["Este producto está agotado", "warning"]]);
    }
  });
}

for (const urlKey of ["bolso-local", "moda/bolso-local", "colección/bolso_mujer.v2", "a".repeat(512), "é".repeat(256)]) {
  test(`valid stored product path is retained: ${urlKey.length > 60 ? `length=${urlKey.length}` : urlKey}`, () => {
    const result = renderSection({ products: [product({ urlKey })] });
    assert.match(result.html, new RegExp(`href="/product/${urlKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.equal(result.buttons.length, 2);
  });
}

for (const urlKey of [null, undefined, "", " ", "/bolso", "bolso/", "//outside.test", "https://outside.test", "javascript:alert(1)", "../bolso", "bolso/../otro", "bolso/./otro", "bolso//otro", "bolso?x=1", "bolso#fragment", "bolso\\otro", "bolso\n", "bolso%2fotro", "%252e%252e/bolso", "a".repeat(513), "é".repeat(257)]) {
  test(`unsafe or absent urlKey is omitted, not replaced with SKU: ${String(urlKey).slice(0, 60)}`, () => {
    const result = renderSection({ products: [product({ urlKey })] });
    assert.doesNotMatch(result.html, /href="\/product\//);
    assert.doesNotMatch(result.html, /SKU-SYNTHETIC/);
    assert.equal(result.buttons.length, 0);
    assert.deepEqual(result.additions, []);
  });
}

test("invalid related rows do not remove valid siblings or change order", () => {
  const result = renderSection({ products: [product({ id: undefined, urlKey: "primero" }), product({ id: undefined, urlKey: null }), product({ id: undefined, urlKey: "ultimo" })] });
  assert.equal(result.buttons.length, 4);
  assert.deepEqual(result.cards.map((item) => item.key), [0, 2], "Fallback keys retain the original product indexes");
  assert.ok(result.html.indexOf('/product/primero') < result.html.indexOf('/product/ultimo'));
  assert.doesNotMatch(result.html, /href="\/product\/SKU-SYNTHETIC/);
});

test("an all-invalid or missing-URL collection omits the whole section, not an empty heading or grid", () => {
  const result = renderSection({ products: [product({ urlKey: null }), product({ urlKey: undefined }), product({ urlKey: "" }), product({ urlKey: "../unsafe" })] });
  assert.equal(result.html, "");
  assert.equal(result.cards.length, 0);
  assert.equal(result.buttons.length, 0);
  assert.deepEqual(result.additions, []);
});

test("special price still uses the real Price component without changing the amount", () => {
  const result = renderSection({ currency: "MXN", products: [product({ specialPrice: "1150.00" })] });
  assert.deepEqual(prices(result.html), [{ currency: "MXN", text: new Intl.NumberFormat(undefined, { style: "currency", currency: "MXN", currencyDisplay: "narrowSymbol" }).format(1150) }]);
});

test("all incumbent classes, titles, description and fixed card props remain unchanged", () => {
  const candidate = readFileSync(candidateFile, "utf8");
  const classes = (source) => [...source.matchAll(/className="([^"]*)"/g)].map(([, value]) => value);
  assert.equal(sha(JSON.stringify(classes(candidate))), "ca60bd73a4ec46e2f7a626947dac0dabcc58f43120bb3e57221b8b26e28d3209");
  assert.match(candidate, /<h2[^>]*>\{title\}<\/h2>/);
  assert.match(candidate, /<p[^>]*>\{description\}<\/p>/);
  for (const fragment of ['price={String(price)}', 'specialPrice={specialPrice ? String(specialPrice) : undefined}', 'name: item?.name || item.sku', 'id: item.id', 'type: item.type']) assert.ok(candidate.includes(fragment), fragment);
});
