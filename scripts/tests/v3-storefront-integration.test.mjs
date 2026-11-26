import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "../..");
const plain = (value) => JSON.parse(JSON.stringify(value));
const interop = (value) => ({ __esModule: true, default: value });

function loader(mocks = {}, globals = {}) {
  const cache = new Map();
  const load = (relative) => {
    const base = path.resolve(root, relative);
    const file = /\.[cm]?[jt]sx?$/.test(base) ? base : [".ts", ".tsx"].map((extension) => `${base}${extension}`).find(existsSync);
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    vm.runInNewContext(output, {
      module: loaded, exports: loaded.exports, URL, console, process,
      ...globals,
      require: (name) => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name.startsWith("@/")) return load(`src/${name.slice(2)}`);
        if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name));
        return require(name);
      },
    }, { filename: file });
    return loaded.exports;
  };
  return load;
}

const api = {
  enabled: true, allows_checkout: true, wa_base_url: "https://wa.me/15550100199", phone_e164: null,
  places: { floating: true, inquiry: true, purchase: true },
  labels: { floating: "Escríbenos", inquiry: "Pregunta al equipo", purchase: "Hablar con ventas" },
  cart_order: true,
};

test("the server config reader consumes the real additive API contract", async () => {
  const requests = [];
  const load = loader({
    "next/headers": { headers: async () => new Headers({ host: "integracion.localhost" }) },
    "../storefront-cache-scope": { storefrontCacheTags: async () => ["local-whatsapp"] },
  }, { fetch: async (url, options) => {
    requests.push({ url, options });
    return Response.json(api);
  } });
  const result = await load("src/utils/server/tenant-whatsapp.ts").getTenantWhatsAppConfig();
  assert.equal(result.cartOrder, true);
  assert.deepEqual(plain(result.places), api.places);
  assert.deepEqual(plain(result.labels), api.labels);
  assert.equal(new URL(requests[0].url).searchParams.get("host"), "integracion.localhost");
  assert.equal(requests[0].options.next.revalidate, 30);
});

test("old API defaults, per-place switches, and disabled stores remain distinct", () => {
  const { parseTenantWhatsAppConfig: parse } = loader()("src/utils/whatsapp.ts");
  const old = parse({ enabled: true });
  assert.deepEqual(plain(old.places), { floating: true, inquiry: true, purchase: true });
  assert.equal(old.cartOrder, false);
  assert.equal(parse({ ...api, places: { floating: false } }).places.floating, false);
  const disabled = parse({ ...api, enabled: false });
  assert.ok(Object.values(disabled.places).every((value) => value === false));
  assert.equal(disabled.cartOrder, false);
  assert.equal(parse({ enabled: "false" }).enabled, false);
  assert.equal(parse(null).enabled, false);
});

function productMarkup(config, saleable = true) {
  const noop = () => null;
  const passthrough = ({ children }) => React.createElement("div", null, children);
  const load = loader({
    "next/navigation": { useSearchParams: () => new URLSearchParams() },
    "next/link": interop(passthrough),
    "@/components/theme/ui/Price": { Price: noop },
    "@/components/common/Rating": { Rating: noop },
    "./VariantSelector": { VariantSelector: noop },
    "./ProductMoreDetail": { ProductMoreDetails: noop },
    "@/components/cod/CodQuickCheckout": interop(noop),
    "@components/theme/search/Prose": interop(noop),
    "@utils/helper": { safePriceValue: () => 10, safeCurrencyCode: () => "USD", safeParse: () => ({}), extractNumericId: () => "1" },
    "@utils/hooks/useVariantInfo": { getVariantInfo: () => ({ Instock: true, variantAttributes: [], possibleOptions: [] }) },
    "@utils/hooks/useAddToCart": { useAddProduct: () => ({ onAddToCart() {}, isCartLoading: false }) },
    "@components/common/icons/LoadingDots": interop(noop),
  });
  const Component = load("src/components/catalog/product/ProductDescription.tsx").ProductDescription;
  return renderToStaticMarkup(React.createElement(Component, {
    product: { id: "1", name: "Producto local", isSaleable: saleable,
      commerce: { soldOut: { showWhatsappCta: true, whatsappUrl: api.wa_base_url } } },
    slug: "producto-local", reviews: [], totalReview: 0, productSwatchReview: {},
    tenantWhatsApp: load("src/utils/whatsapp.ts").parseTenantWhatsAppConfig(config), localeCode: "es",
  }));
}

test("actual product buttons honor inquiry and purchase independently, including sold-out", () => {
  assert.match(productMarkup(api), /Pregunta al equipo/);
  assert.doesNotMatch(productMarkup({ ...api, places: { inquiry: false } }), /wa\.me/);
  assert.match(productMarkup({ ...api, allows_checkout: false }), /Hablar con ventas/);
  assert.doesNotMatch(productMarkup({ ...api, allows_checkout: false, places: { purchase: false } }), /wa\.me/);
  assert.match(productMarkup(api, false), /Pregunta al equipo/);
  assert.doesNotMatch(productMarkup({ ...api, places: { inquiry: false } }, false), /wa\.me/);
  assert.doesNotMatch(productMarkup({ ...api, enabled: false }), /wa\.me/);
});

test("actual floating button renders the custom text safely, with no link when disabled", async () => {
  const load = loader({
    "./footer": interop(() => null), "./navbar": interop(() => null),
    "@/utils/server/tenant-whatsapp": { getTenantWhatsAppConfig: async () => ({
      ...loader()("src/utils/whatsapp.ts").parseTenantWhatsAppConfig(api),
      labels: { floating: "<script>consulta</script>" },
    }) },
  });
  const Shell = load("src/components/layout/StorefrontShell.tsx").default;
  const html = renderToStaticMarkup(await Shell({ children: null }));
  assert.match(html, /&lt;script&gt;consulta&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  const Floating = load("src/components/common/whatsapp/FloatingWhatsAppButton.tsx").default;
  assert.equal(renderToStaticMarkup(React.createElement(Floating, { href: null })), "");
});

test("visit payload strips personal query/fragment/referrer data and preserves actual IDs/results", () => {
  const { storefrontVisitPayload: payload, storefrontPageId: id } = loader()("src/utils/storefront-visit.ts");
  const result = plain(payload({ pageType: "product", pageId: "gid://Product/42" },
    "http://integracion.localhost/product/local?email=local%40example.test#secret", "https://example.test/path?personal=yes"));
  assert.deepEqual(result, { path: "/product/local", page_type: "product", page_id: 42, referrer: "https://example.test" });
  assert.equal(id("sku42"), undefined);
  assert.equal(id("4294967296"), undefined);
  assert.deepEqual(plain(payload({ pageType: "search", term: "zapatos", results: 0 },
    "http://integracion.localhost/search?q=zapatos&utm_source=ig", "")),
  { path: "/search", page_type: "search", source: "ig", term: "zapatos", results: 0 });
  assert.ok(Buffer.byteLength(JSON.stringify(payload({ pageType: "search", term: "🛒".repeat(250), results: 999999 },
    `http://integracion.localhost/${"🛒".repeat(255)}?utm_source=${"x".repeat(100)}`, ""))) < 4096);
});

test("navigation sends once, handles SPA visits and search changes, and does not expose session data", async () => {
  const { reportStorefrontVisit: report } = loader()("src/utils/storefront-visit.ts");
  const requests = [];
  const transport = async (url, options) => { requests.push({ url, options }); return new Response(null, { status: 204 }); };
  report({ pageType: "home" }, "http://integracion.localhost/", "https://example.test/", transport);
  report({ pageType: "home" }, "http://integracion.localhost/", "https://example.test/", transport);
  report({ pageType: "search", term: "uno", results: 0 }, "http://integracion.localhost/search?q=uno", "https://example.test/", transport);
  report({ pageType: "search", term: "dos", results: 2 }, "http://integracion.localhost/search?q=dos", "https://example.test/", transport);
  assert.equal(requests.length, 3);
  assert.equal(JSON.parse(requests[1].options.body).referrer, "http://integracion.localhost");
  for (const { url, options } of requests) {
    assert.equal(url, "/api/storefront/visit");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "omit");
    assert.equal(options.mode, "same-origin");
    assert.deepEqual(plain(options.headers), { "Content-Type": "application/json" });
  }
  report({ pageType: "cart" }, "http://integracion.localhost/cart", "", async () => { throw new Error("offline"); });
  await new Promise((resolve) => setImmediate(resolve));
});

test("the rendered tracker defers hidden/prerendered documents until activation and cleans up", () => {
  const listeners = new Map();
  const calls = [];
  let cleanup;
  const document = {
    prerendering: true, visibilityState: "hidden", referrer: "",
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name),
  };
  const load = loader({
    react: { useEffect: (effect) => { cleanup = effect(); } },
    "next/navigation": { usePathname: () => "/" },
    "@/utils/storefront-visit": { reportStorefrontVisit: (...args) => calls.push(args) },
  }, { document, window: { location: { href: "http://integracion.localhost/" } } });
  assert.equal(load("src/components/common/StorefrontVisit.tsx").default({ pageType: "home" }), null);
  assert.equal(calls.length, 0);
  document.prerendering = false;
  document.visibilityState = "visible";
  listeners.get("prerenderingchange")();
  assert.equal(calls.length, 1);
  cleanup();
  assert.equal(listeners.size, 0);
});
