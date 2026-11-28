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
    assert.equal(options.referrerPolicy, "strict-origin");
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


test("checkout renders the visit marker without using its route group layout", async () => {
  const load = loader({
    "@/components/checkout": { __esModule: true, default: () => null },
    "@/components/common/StorefrontVisit": { __esModule: true, default: ({ pageType }) => React.createElement("span", null, pageType) },
  });
  const { default: CheckoutPage } = load("src/app/(checkout)/checkout/page.tsx");
  assert.equal(renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve({}) })), "<span>checkout</span>");
});

test("the tracker omits checkout receipt paths, obvious contact searches and free-form source values", () => {
  const { reportStorefrontVisit: report, storefrontVisitPayload: payload } = loader()("src/utils/storefront-visit.ts");
  report({ pageType: "checkout" }, "https://shop.example.test/checkout/whatsapp-order/99", "", () => assert.fail("receipt reported"));
  for (const term of ["buyer@example.test", "+1 (202) 555-0100"]) {
    const result = plain(payload({ pageType: "search", term, results: 0 }, "https://shop.example.test/search?utm_source=buyer%40example.test", ""));
    assert.deepEqual(result, { path: "/search", page_type: "search" });
  }
});
