import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "graphql";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const source = (file) => readFileSync(path.join(root, file), "utf8");

// Execute the installed TS functions, not copies of their parsers. The only
// transport/store dependencies are inert, per-test fixtures. An unlisted import
// fails: no Next boot, .env, fetch, SDK, DB, cart or order creation can run.
function loadText(text, file, dependencies = {}, globals = {}) {
  const result = ts.transpileModule(text, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }, reportDiagnostics: true });
  assert.equal(result.diagnostics?.length ?? 0, 0);
  const fixture = { exports: {} };
  vm.runInNewContext(result.outputText, {
    module: fixture, exports: fixture.exports, Intl, ...globals,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename: file, timeout: 1000 });
  return fixture.exports;
}
const load = (file, dependencies, globals) => loadText(source(file), file, dependencies, globals);
const plain = (value) => JSON.parse(JSON.stringify(value));
const money = load("src/utils/storefront-money.ts");
const gate = load("src/utils/server/cod-feature-gate.ts");
const filters = load("src/utils/storefront-filters.ts");
const provider = load("src/providers/StorefrontCurrencyProvider.tsx", {
  react: React, "react/jsx-runtime": jsxRuntime, "@/utils/storefront-money": money,
});
const { Price } = load("src/components/theme/ui/Price.tsx", {
  "react/jsx-runtime": jsxRuntime,
  "@/providers/StorefrontCurrencyProvider": provider,
  "@/utils/storefront-money": money,
});
const query = load("src/graphql/cod/queries/GetProductCodSnapshot.ts", {
  "@apollo/client": { gql: (strings) => parse(strings.join("")) },
}).GET_PRODUCT_COD_SNAPSHOT;

const product = {
  id: "42", name: "Synthetic boundary product", type: "simple",
  price: "1150.00", specialPrice: "0", isSaleable: true,
  images: [{ url: "/synthetic-product.png" }],
  superAttributes: [], configutableData: { index: [] },
};
const snapshot = {
  id: 42, title: product.name, image: "/synthetic-product.png",
  base_price: 1150, has_variants: false, is_saleable: true,
  type: "simple", attributes: [], variant_index: {},
};
const settings = {
  plan_name: "mipyme", active: true, title: "Synthetic COD", description: "Fixture",
  countries: ["CO"], min_total: null, max_total: null,
  allowed_shipping_methods: ["flat_flat"], fee_type: "none", fee_value: null,
  require_email: false, require_whatsapp: true,
  modal_enabled: true, modal_cta_text: "Fixture CTA", modal_helper_text: "Fixture help",
};
const remoteConfig = (unit, overrides = {}) => ({ data: {
  feature_key: "cash_on_delivery", product_id: 42, reason: null,
  plan_name: "mipyme", allowed_by_plan: true, cod_active: true, available: true,
  product_allows_cod: true, product_is_stockable: true,
  product_snapshot: { ...snapshot, currency_code: unit }, offers: [],
  modal: { modal_enabled: true, modal_cta_text: "Fixture CTA" },
  ...overrides,
} });

class NativeUnavailable extends Error {}
const unavailableResponses = { storefrontUnavailableResponse(error) {
  return error instanceof NativeUnavailable ? { status: 503, body: { message: "No pudimos conectar con la tienda. Vuelve a intentarlo." } } : null;
} };

function fixture({ remote = null, graphProduct = null, graphRejects = false, localSettings = settings } = {}) {
  const calls = { landlord: [], graphql: [], storeReads: [] };
  const productModule = load("src/utils/server/cod-product-snapshot.ts", {
    "@/utils/storefront-money": money,
    "@/utils/storefront-filters": filters,
    "@/graphql": {
      GET_PRODUCT_COD_SNAPSHOT: query,
      async graphqlRequestNoCache(document, variables) {
        assert.equal(document, query);
        assert.equal(variables.input.find((row) => ["id", "product_id"].includes(row.key))?.value, "42");
        calls.graphql.push(plain(variables));
        if (graphRejects) throw new Error("Synthetic GraphQL read failure");
        return { products: { data: graphProduct ? [structuredClone(graphProduct)] : [] } };
      },
    },
  });
  const configModule = load("src/utils/server/cod-config.ts", {
    "server-only": {},
    "@/utils/storefront-money": money,
    "@/utils/server/cod-product-snapshot": productModule,
    "@/utils/server/cod-feature-gate": gate,
    "@/utils/server/cod-store": {
      getTenantCodSettings(host) { calls.storeReads.push(host); return structuredClone(localSettings); },
      listTenantCodOffers(host) { calls.storeReads.push(host); return []; },
    },
    "./client-context": { StorefrontConnectionUnavailable: NativeUnavailable },
    "./cod-config-reader": { async fetchNativeCodConfig(host, productId) {
      assert.equal(productId, 42);
      calls.landlord.push({ endpoint: "/api/checkout/cod/config", host, method: "GET" });
      if (!remote) throw new NativeUnavailable();
      return structuredClone(remote);
    } },
  });
  return { ...productModule, ...configModule, calls };
}

function priceMarkup(value, context = "MXN") {
  return renderToStaticMarkup(React.createElement(provider.StorefrontCurrencyProvider, { currencyCode: context },
    React.createElement(Price, { amount: String(value?.base_price ?? 1150), currencyCode: value?.currency_code ?? null })));
}

// Lift only the existing validator declaration using the TS AST. Do NOT load or
// call processCodOrder/create-order: those effects are outside this test.
function validator(config) {
  const file = "src/utils/server/cod-order.ts";
  const text = source(file);
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "validateCodOrder");
  assert.ok(declaration);
  return loadText(`${declaration.getText(ast)}\nexport { validateCodOrder };`, file, {}, {
    resolveCodCheckoutConfig: async () => config,
  }).validateCodOrder;
}

test("the real COD query requests currencyCode; null is distinguished from an authoritative USD", () => {
  const fields = [];
  function visit(node) {
    if (node.kind === "Field") fields.push(node.name.value);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((item) => item && typeof item === "object" && visit(item));
      else if (value && typeof value === "object" && value.kind) visit(value);
    }
  }
  visit(query);
  assert.ok(fields.includes("priceHtml"));
  assert.ok(fields.includes("currencyCode"));
});

for (const [label, priceHtml] of [
  ["missing priceHtml", undefined], ["null priceHtml", null],
  ["missing code", {}], ["null code", { currencyCode: null }],
  ["empty code", { currencyCode: "" }], ["whitespace code", { currencyCode: "  " }],
  ["non-string code", { currencyCode: 840 }], ["malformed code", { currencyCode: "CO" }],
]) {
  test(`GraphQL ${label} cannot mint a USD product snapshot`, async () => {
    const actual = fixture({ graphProduct: { ...product, priceHtml } });
    assert.equal(await actual.getCodProductSnapshot(42), null);
    assert.equal(actual.calls.graphql.length, 1);
  });
}

for (const unit of [undefined, null, "", "  ", 840, "CO"]) {
  test(`landlord incomplete currency (${String(unit)}) cannot stay available when GraphQL is also incomplete`, async () => {
    const remote = remoteConfig(unit);
    const before = JSON.stringify(remote);
    const actual = fixture({ remote, graphProduct: { ...product, priceHtml: null } });
    const config = await actual.resolveCodCheckoutConfig("fixture-co.localhost", 42);
    assert.equal(config.product_snapshot, null);
    assert.equal(config.available, false);
    assert.equal(config.reason, "product_snapshot_unavailable");
    assert.equal(config.allowed_by_plan, true);
    assert.equal(config.cod_active, true);
    assert.equal(config.modal.modal_enabled, true);
    assert.equal(actual.calls.graphql.length, 1);
    assert.equal(actual.calls.landlord.length, 1);
    assert.equal(JSON.stringify(remote), before);
  });
}

test("a missing GraphQL currency cannot reach actual Price SSR labeled USD or inherit MXN context", async () => {
  const actual = await fixture({ graphProduct: { ...product, priceHtml: null } }).getCodProductSnapshot(42);
  const html = priceMarkup(actual);
  assert.doesNotMatch(html, /data-currency=/);
  assert.match(html, />—<\/p>/);
});

for (const unit of ["COP", "MXN", "USD", "EUR", "JPY", "KWD"]) {
  test(`explicit ${unit} preserves the snapshot, amount and real Price semantics without conversion`, async () => {
    const graphProduct = { ...product, priceHtml: { currencyCode: unit } };
    const before = JSON.stringify(graphProduct);
    const actual = fixture({ graphProduct });
    const resolved = await actual.getCodProductSnapshot(42);
    assert.deepEqual(plain(resolved), { ...snapshot, currency_code: unit });
    assert.equal(JSON.stringify(graphProduct), before);
    const remote = fixture({ remote: remoteConfig(unit) });
    const config = await remote.resolveCodCheckoutConfig("fixture-other.localhost", 42);
    assert.deepEqual(plain(config.product_snapshot), { ...snapshot, currency_code: unit });
    assert.equal(config.available, true);
    assert.equal(config.allowed_by_plan, true);
    assert.equal(config.cod_active, true);
    assert.equal(remote.calls.graphql.length, 0);
    assert.match(priceMarkup(resolved), new RegExp(`data-currency="${unit}"`));
    assert.ok(priceMarkup(resolved).includes(money.formatStorefrontPrice("1150", unit)));
  });
}

test("existing GraphQL fallback recovers metadata in the same request (matching ID is a fixture, not identity certification)", async () => {
  const actual = fixture({ remote: remoteConfig(null), graphProduct: { ...product, priceHtml: { currencyCode: "MXN" } } });
  const config = await actual.resolveCodCheckoutConfig("fixture-co.localhost", 42);
  assert.equal(config.product_snapshot.currency_code, "MXN");
  assert.equal(config.product_snapshot.base_price, 1150);
  assert.equal(config.available, true);
  assert.equal(actual.calls.graphql.length, 1);
});

test("missing native config cannot fall back to local settings or a GraphQL snapshot", async () => {
  const actual = fixture({ graphProduct: { ...product, priceHtml: null } });
  await assert.rejects(actual.resolveCodCheckoutConfig("fixture-co.localhost", 42), NativeUnavailable);
  assert.equal(actual.calls.graphql.length, 0);
  assert.equal(actual.calls.storeReads.length, 0);
});

test("existing plan/inactive restrictions and reasons are not replaced by the incomplete-snapshot guard", async () => {
  for (const [overrides, reason] of [
    [{ plan_name: "basic", allowed_by_plan: false, available: false, reason: "plan_not_allowed" }, "plan_not_allowed"],
    [{ cod_active: false, available: false, reason: "cod_inactive" }, "cod_inactive"],
    [{ product_allows_cod: false, available: false, reason: "product_blocks_cod" }, "product_blocks_cod"],
  ]) {
    const config = await fixture({ remote: remoteConfig(null, overrides) }).resolveCodCheckoutConfig("fixture-co.localhost", 42);
    assert.equal(config.reason, reason);
    assert.equal(config.available, false);
    assert.equal(config.allowed_by_plan, overrides.allowed_by_plan ?? true);
    assert.equal(config.cod_active, overrides.cod_active ?? true);
    assert.equal(config.product_allows_cod, overrides.product_allows_cod ?? true);
  }
  for (const localSettings of [{ ...settings, plan_name: "basic" }, { ...settings, active: false }, settings]) {
    const actual = fixture({ localSettings });
    await assert.rejects(actual.resolveCodCheckoutConfig("fixture-co.localhost", 42), NativeUnavailable);
    assert.equal(actual.calls.storeReads.length, 0);
  }
});

test("the existing validator rejects the closed config before pricing, cart, storage or order effects", async () => {
  const config = await fixture({ remote: remoteConfig(null), graphProduct: { ...product, priceHtml: null } }).resolveCodCheckoutConfig("fixture-co.localhost", 42);
  assert.equal(config.available, false);
  const validation = await validator(config)("fixture-co.localhost", { product_id: 42 });
  assert.equal(validation.ok, false);
  assert.equal(validation.status, 422);
  assert.equal(validation.grandTotal, 0);
  assert.equal(validation.resolvedVariantLines.length, 0);
});

test("the actual read-only Next config handler exposes unavailable metadata without enabling COD", async () => {
  const actual = fixture({ remote: remoteConfig(null), graphProduct: { ...product, priceHtml: null } });
  const api = load("src/app/api/checkout/cod/config/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/utils/server/cod-config": actual,
    "@/utils/server/tenant-runtime": { getRuntimeHost: async () => "fixture-co.localhost" },
    "@/utils/server/storefront-unavailable": unavailableResponses,
  }, { URL });
  const response = await api.GET({ url: "http://fixture-co.localhost/api/checkout/cod/config?product_id=42" });
  assert.equal(response.status, 200);
  assert.equal(response.body.product_snapshot, null);
  assert.equal(response.body.available, false);
});

for (const [label, remote, reason] of [
  ["canonical metadata fallback", remoteConfig(null), "product_snapshot_unavailable"],
  ["prior product restriction", remoteConfig(null, { available: false, reason: "product_blocks_cod", product_allows_cod: false }), "product_blocks_cod"],
]) {
  test(`a rejected GraphQL read (${label}) returns a closed config, not an ignored HTTP 500`, async () => {
    const actual = fixture({ remote, graphRejects: true });
    const api = load("src/app/api/checkout/cod/config/route.ts", {
      "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
      "@/utils/server/cod-config": actual,
      "@/utils/server/tenant-runtime": { getRuntimeHost: async () => "fixture-co.localhost" },
      "@/utils/server/storefront-unavailable": unavailableResponses,
    }, { URL });
    const response = await api.GET({ url: "http://fixture-co.localhost/api/checkout/cod/config?product_id=42" });
    assert.equal(response.status, 200);
    assert.equal(response.body.product_snapshot, null);
    assert.equal(response.body.available, false);
    assert.equal(response.body.reason, reason);
    assert.equal(response.body.allowed_by_plan, true);
    assert.equal(response.body.cod_active, true);
    assert.equal(response.body.product_allows_cod, label !== "prior product restriction");
    assert.equal(actual.calls.graphql.length, label === "prior product restriction" ? 0 : 1, "A backend denial cannot trigger a metadata retry");
    assert.doesNotMatch(JSON.stringify(response.body), /Synthetic GraphQL read failure/);
  });
}

test("native transport failure is a generic503, not a fabricated billing-plan403 or memory config", async () => {
  const actual = fixture({ graphRejects: true });
  const api = load("src/app/api/checkout/cod/config/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/utils/server/cod-config": actual,
    "@/utils/server/tenant-runtime": { getRuntimeHost: async () => "fixture-co.localhost" },
    "@/utils/server/storefront-unavailable": unavailableResponses,
  }, { URL });
  const response = await api.GET({ url: "http://fixture-co.localhost/api/checkout/cod/config?product_id=42" });
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { message: "No pudimos conectar con la tienda. Vuelve a intentarlo." });
  assert.equal(actual.calls.graphql.length, 0);
  assert.equal(actual.calls.storeReads.length, 0);
});
