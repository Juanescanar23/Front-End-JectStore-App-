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
function load(relative, dependencies = {}, globals = {}) {
  const text = readFileSync(path.join(root, relative), "utf8");
  const result = ts.transpileModule(text, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }, reportDiagnostics: true });
  assert.equal(result.diagnostics?.length ?? 0, 0);
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, { module, exports: module.exports,
    URLSearchParams, ...globals,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename: relative, timeout: 1000 });
  return module.exports;
}
const copy = load("src/utils/storefront-copy.ts");
const props = {
  product: { id: "1", name: "Synthetic product", type: "simple", price: "27000" },
  slug: "synthetic-product", reviews: [], totalReview: 0,
  productSwatchReview: null, tenantWhatsApp: null,
};
const interop = value => ({ __esModule: true, default: value });
const empty = () => null;
const clientDependencies = {
  react: React, "react/jsx-runtime": jsx,
  "@/components/theme/ui/Price": { Price: empty },
  "@/components/common/Rating": { Rating: empty },
  "@/components/cart/AddToCart": { AddToCart: empty },
  "./VariantSelector": { VariantSelector: empty },
  "./ProductMoreDetail": { ProductMoreDetails: empty },
  "@utils/hooks/useVariantInfo": { getVariantInfo: () => ({ variantAttributes: [], possibleOptions: {} }) },
  "next/navigation": { useSearchParams: () => new URLSearchParams() },
  "@components/theme/search/Prose": interop(empty),
  "@utils/helper": {
    safePriceValue: () => 27000, safeCurrencyCode: () => "COP",
    safeParse: value => value, extractNumericId: value => Number(value),
  },
  "next/link": interop(({ children, ...attributes }) => React.createElement("a", attributes, children)),
  "@/utils/whatsapp": { buildProductWhatsAppUrl: () => null },
  "@/components/cod/CodQuickCheckout": interop(empty),
  "@/utils/storefront-copy": copy,
  "@/utils/product-commerce": {
    resolveProductPurchaseState: () => ({ isSaleable: true, showWhatsAppCta: false, statusLabel: "Disponible" }),
    SOLD_OUT_WHATSAPP_HELPER: "Synthetic fixture",
  },
};

test("the incumbent browser detector demonstrates why a Node navigator cannot choose SSR copy", () => {
  const server = load("src/utils/storefront-copy.ts", {}, { navigator: { language: "en-US" } });
  const browser = load("src/utils/storefront-copy.ts", {}, { navigator: { language: "en-US" }, document: { documentElement: { lang: "es" } } });
  assert.equal(server.getStorefrontCopy("homeBreadcrumb", server.detectClientLocaleRoot()), "Home /");
  assert.equal(browser.getStorefrontCopy("homeBreadcrumb", browser.detectClientLocaleRoot()), "Inicio /");
});

for (const [localeCode, expected] of [["es", "Inicio /"], ["es-MX", "Inicio /"], ["en-US", "Home /"], [null, "Inicio /"]]) {
  test(`real product component uses the same request locale for SSR and hydration: ${localeCode}`, () => {
    const serverComponent = load("src/components/catalog/product/ProductDescription.tsx", clientDependencies,
      { navigator: { language: "en-US" } }).ProductDescription;
    const clientComponent = load("src/components/catalog/product/ProductDescription.tsx", clientDependencies,
      { navigator: { language: "pt-BR" }, document: { documentElement: { lang: "fr" } } }).ProductDescription;
    const server = renderToStaticMarkup(React.createElement(serverComponent, { ...props, localeCode }));
    const hydration = renderToStaticMarkup(React.createElement(clientComponent, { ...props, localeCode }));
    assert.equal(server, hydration);
    assert.ok(server.includes(`>${expected}</a>`));
    assert.equal((server.match(/<h1\b/g) || []).length, 1);
  });
}

test("the real server boundary passes the existing request locale, with the same fallback as the root layout", async () => {
  for (const value of ["es", "en-CA", undefined]) {
    const calls = [];
    const product = load("src/components/catalog/product/ProductInfo.tsx", {
      "react/jsx-runtime": jsx,
      "./ProductDescription": { ProductDescription: empty },
      "@/utils/hooks/getProductSwatchAndReview": { getProductWithSwatchAndReview: async slug => { calls.push(slug); return null; } },
      "@/utils/server/tenant-whatsapp": { getTenantWhatsAppConfig: async () => null },
      "@/utils/server/storefront-locale": { getStorefrontLocaleCode: async () => value },
    }).default;
    const element = await product(props);
    assert.equal(element.props.localeCode, value || "es");
    assert.equal(element.props.product, props.product);
    assert.equal(element.props.slug, props.slug);
    assert.equal(element.props.reviews, props.reviews);
    assert.equal(element.props.totalReview, props.totalReview);
    assert.deepEqual(calls, [props.slug]);
  }
});
