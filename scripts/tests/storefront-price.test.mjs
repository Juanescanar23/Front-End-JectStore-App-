import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const nativeRequire = createRequire(import.meta.url);
const priceFile = "src/components/theme/ui/Price.tsx";
const providerFile = "src/providers/StorefrontCurrencyProvider.tsx";
const interop = (value) => ({ default: value, __esModule: true });
const passthrough = ({ children }) => React.createElement(React.Fragment, null, typeof children === "function" ? children(() => {}) : children);
const baseline = (amount, currency, locale = "en-US") => new Intl.NumberFormat(locale, {
  style: "currency", currency, currencyDisplay: "narrowSymbol",
}).format(parseFloat(amount));
const text = (html) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&");

function sourceLoader({ locale = "en-US", mocks = {} } = {}) {
  const cache = new Map();
  // Model different host/browser default locales without changing global Intl.
  // Explicit locales still use the actual runtime formatter.
  const fixtureIntl = { NumberFormat: function NumberFormat(locales, options) { return new Intl.NumberFormat(locales ?? locale, options); } };
  const load = (relative) => {
    const candidate = path.isAbsolute(relative) ? relative : path.join(root, relative);
    const file = [candidate, `${candidate}.ts`, `${candidate}.tsx`].find((name) => existsSync(name));
    assert.ok(file, `Missing source: ${relative}`);
    if (cache.has(file)) return cache.get(file).exports;
    const fixtureModule = { exports: {} };
    cache.set(file, fixtureModule);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(output, {
      module: fixtureModule, exports: fixtureModule.exports, Intl: fixtureIntl, URLSearchParams, console,
      require: (name) => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name.startsWith("@/")) return load(`src/${name.slice(2)}`);
        if (name.startsWith("@components/")) return load(`src/components/${name.slice(12)}`);
        if (name.startsWith("@utils/")) return load(`src/utils/${name.slice(7)}`);
        if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name));
        return nativeRequire(name);
      },
    });
    return fixtureModule.exports;
  };
  return load;
}

function priceMarkup({ amount = "3499000.00", currencyCode = "COP", locale = "en-US", context, ...props } = {}) {
  const load = sourceLoader({ locale });
  const { Price } = load(priceFile);
  const element = React.createElement(Price, { amount, currencyCode, className: "existing-price-class", ...props });
  const tree = context === undefined ? element : React.createElement(load(providerFile).StorefrontCurrencyProvider, { currencyCode: context }, element);
  return renderToStaticMarkup(tree);
}

test("actual Price renders COP without decimals, with grouping, zero and negative amounts intact", () => {
  for (const [amount, expected] of [["3499000.00", "$3,499,000"], ["0", "$0"], ["1000", "$1,000"], ["-1234.00", "-$1,234"], ["1234.56", "$1,235"]]) {
    const html = priceMarkup({ amount });
    assert.equal(text(html), expected);
    assert.match(html, /class="existing-price-class"/);
    assert.match(html, /data-currency="COP"/);
    assert.equal(typeof amount, "string", "Formatting never rewrites the supplied monetary value");
  }
});

test("other currencies retain the exact incumbent locale and ISO minor-unit behavior", () => {
  for (const locale of ["en-US", "es-CO", "de-DE"]) {
    for (const currencyCode of ["USD", "MXN", "JPY", "KWD", "EUR"]) {
      for (const amount of ["3499000.00", "1234.567", "0"]) {
        assert.equal(text(priceMarkup({ amount, currencyCode, locale })), baseline(amount, currencyCode, locale), `${locale}/${currencyCode}/${amount}`);
      }
    }
  }
  assert.equal(text(priceMarkup({ amount: "1234", currencyCode: "JPY" })), "¥1,234");
  assert.equal(text(priceMarkup({ amount: "1234", currencyCode: "KWD" })), "KWD 1,234.000");
});

test("COP SSR and client-equivalent initial renders agree even when their default locales differ", () => {
  const server = priceMarkup({ locale: "en-US", amount: "3499000.00" });
  const clientEquivalent = priceMarkup({ locale: "de-DE", amount: "3499000.00" });
  assert.equal(server, clientEquivalent);
  assert.equal(text(clientEquivalent), "$3,499,000");
});

test("actual provider supplies the channel unit, explicit currency wins, and explicit unknown never inherits", () => {
  const load = sourceLoader();
  const { Price } = load(priceFile);
  const { StorefrontCurrencyProvider } = load(providerFile);
  const render = (currencyCode) => renderToStaticMarkup(React.createElement(StorefrontCurrencyProvider, { currencyCode: "COP" }, React.createElement(Price, { amount: "1234.50", currencyCode })));
  assert.equal(text(render(undefined)), "$1,235");
  assert.equal(text(render("MXN")), baseline("1234.50", "MXN"));
  assert.equal(text(render("USD")), baseline("1234.50", "USD"));
  for (const currencyCode of [null, "", "not-a-currency"]) {
    const html = render(currencyCode);
    assert.equal(text(html), "—");
    assert.doesNotMatch(html, /data-currency=/);
  }
  assert.equal(text(renderToStaticMarkup(React.createElement(Price, { amount: "1234.50" }))), "—");
});

test("server wrapper uses verified experience currency first and isolates legacy/new channel contexts", async () => {
  const results = await Promise.all([
    { host: "existing-cop.test", experience: { currency: "COP" }, channel: "USD", expectedQueries: 0, expected: "$3,499,000" },
    { host: "new-mxn.test", experience: null, channel: "MXN", expectedQueries: 1, expected: baseline("3499000.00", "MXN") },
    { host: "existing-usd.test", experience: null, channel: "USD", expectedQueries: 1, expected: baseline("3499000.00", "USD") },
  ].map(async (scenario) => {
    let queries = 0;
    const load = sourceLoader({ mocks: {
      "server-only": {},
      "./MainProvider": { MainProvider: passthrough },
      "@/lib/storefront-experience/server": { getVerifiedExperienceContext: async () => scenario.experience },
      "@/lib/graphql-fetch": { graphqlRequest: async (_query, variables, options) => {
        queries++; assert.equal(variables, undefined); assert.deepEqual(JSON.parse(JSON.stringify(options)), { tags: ["channel"], life: "hours" });
        return { getDefaultChannel: { baseCurrency: { code: scenario.channel } } };
      } },
    } });
    const { Price } = load(priceFile);
    const { AppWrapper } = load("src/providers/AppWrapper.tsx");
    const html = renderToStaticMarkup(await AppWrapper({ children: React.createElement(Price, { amount: "3499000.00" }) }));
    assert.equal(text(html), scenario.expected, scenario.host);
    assert.equal(queries, scenario.expectedQueries);
    return html;
  }));
  assert.notEqual(results[0], results[1]);
});

test("missing/unavailable currency metadata keeps the storefront wrapper usable without an invented unit", async () => {
  for (const missing of ["empty", "error"]) {
    const load = sourceLoader({ mocks: {
      "server-only": {}, "./MainProvider": { MainProvider: passthrough },
      "@/lib/storefront-experience/server": { getVerifiedExperienceContext: async () => null },
      "@/lib/graphql-fetch": { graphqlRequest: async () => { if (missing === "error") throw new Error("synthetic metadata outage"); return { getDefaultChannel: null }; } },
    } });
    const { Price } = load(priceFile);
    const { AppWrapper } = load("src/providers/AppWrapper.tsx");
    const html = renderToStaticMarkup(await AppWrapper({ children: React.createElement("section", null, "Tienda", React.createElement(Price, { amount: "42" })) }));
    assert.match(html, /Tienda/);
    assert.match(html, /—/);
    assert.doesNotMatch(html, /data-currency=/);
  }
});

const cart = { id: 12, itemsQty: 1, isGuest: true, subtotal: "3499000.00", taxAmount: "190000", shippingAmount: "10000", grandTotal: "3699000.00", selectedShippingRate: "free_free", paymentMethod: "moneytransfer", items: { edges: [{ node: { id: 7, productId: 9, name: "Producto sintético", sku: "LOCAL-CURRENCY", price: "3499000.00", quantity: 1, productUrlKey: "local", baseImage: "/image/placeholder.webp", canChangeQty: true } }] } };

function commerceLoader({ desktop = true, order, locale = "en-US" } = {}) {
  const icon = () => React.createElement("svg");
  const hooks = { useCartDetail: () => ({ isLoading: false }) };
  const helper = { createUrl: (value) => value, isCheckout: () => "/checkout", useAddressesFromApi: () => ({ billingAddress: null }), safeParse: () => null };
  const image = interop(({ alt }) => React.createElement("img", { alt, src: "/image/placeholder.webp" }));
  return sourceLoader({ locale, mocks: {
    react: order ? { ...React, useState: (value) => [value === true ? false : Array.isArray(value) ? [order] : value, () => {}], useEffect() {} } : React,
    "@/store/hooks": { useAppSelector: () => ({ cart }) },
    "@/utils/hooks/useCartDetail": hooks, "@utils/hooks/useCartDetail": hooks,
    "@/utils/helper": helper, "@utils/helper": helper,
    "@/utils/actions": { redirectToCheckout: "/synthetic-checkout" },
    "@/utils/cart/normalize": { resolveCartItemImage: () => "/image/placeholder.webp" }, "@utils/cart/normalize": { resolveCartItemImage: () => "/image/placeholder.webp" },
    "@/store/local-storage": { EMAIL: "email", getLocalStorage: () => null },
    "@/utils/constants": { DEFAULT_OPTION: "Default", NOT_IMAGE: "/image/placeholder.webp", getProductImageUrl: () => "/image/placeholder.webp" },
    "@utils/constants": { NOT_IMAGE: "/image/placeholder.webp" },
    "@/utils/type-guards": { isObject: (value) => Boolean(value) && typeof value === "object" },
    "@utils/type-guards": { isObject: (value) => Boolean(value) && typeof value === "object" },
    "@utils/hooks/useMediaQueryHook": { useMediaQuery: () => desktop },
    "@/utils/hooks/useScrollTo": { useScrollTo: () => () => {} },
    "@/utils/hooks/useToast": { useCustomToast: () => ({ showToast() {} }) },
    "react-dom": { useFormStatus: () => ({ pending: false }) },
    "@heroui/react": { useDisclosure: () => ({ isOpen: true, onOpen() {}, onOpenChange() {} }) },
    "@heroui/drawer": { Drawer: passthrough, DrawerBody: passthrough, DrawerContent: passthrough, DrawerFooter: passthrough, DrawerHeader: passthrough },
    "@heroui/accordion": { Accordion: passthrough, AccordionItem: ({ title, subtitle, children }) => React.createElement("section", null, title, subtitle, children) },
    "@heroicons/react/24/outline": { ArrowLeftIcon: icon, ShoppingCartIcon: icon, ChevronLeftIcon: icon, ChevronRightIcon: icon },
    "next/link": interop(({ children, href, ...props }) => React.createElement("a", { href, ...props }, children)),
    "next/image": image,
    "@/components/common/NextImage": { NextImage: image.default },
    "@/components/theme/ui/grid/Tile": { GridTileImage: image.default }, "@components/theme/ui/grid/Tile": { GridTileImage: image.default },
    "@/components/theme/ui/AddToCartButton": interop(() => React.createElement("button", null, "Agregar")),
    "./OpenCart": interop(() => React.createElement("span", null, "Carrito")),
    "../common/icons/cart/CloseCart": interop(icon),
    "@/components/common/icons/cart/DeleteItemButton": { DeleteItemButton: icon }, "../common/icons/cart/DeleteItemButton": { DeleteItemButton: icon },
    "@/components/common/icons/cart/EditItemQuantityButton": { EditItemQuantityButton: icon }, "../common/icons/cart/EditItemQuantityButton": { EditItemQuantityButton: icon },
  } });
}

for (const [file, props] of [
  ["src/components/cart/CartPage.tsx", {}], ["src/components/cart/CartModal.tsx", {}],
  ["src/components/checkout/checkout-cart/CheckoutCart.tsx", { cartItems: cart }],
  ["src/components/checkout/checkout-cart/CartItemAccordian.tsx", { cartItems: cart }],
]) {
  test(`${path.basename(file)} renders real amounts in its actual channel currency, desktop and mobile`, () => {
    const original = JSON.stringify(cart);
    for (const currencyCode of ["COP", "USD", "MXN"]) for (const desktop of [true, false]) {
      const load = commerceLoader({ desktop });
      const Component = load(file).default;
      const { StorefrontCurrencyProvider } = load(providerFile);
      const html = renderToStaticMarkup(React.createElement(StorefrontCurrencyProvider, { currencyCode }, React.createElement(Component, props)));
      const prices = [...html.matchAll(/<p\b[^>]*data-currency="([^"]+)"[^>]*>(.*?)<\/p>/g)];
      assert.ok(prices.length >= 3, `${file} renders all native summary prices`);
      assert.ok(prices.every((entry) => entry[1] === currencyCode));
      const expectedItem = currencyCode === "COP" ? "$3,499,000" : baseline("3499000.00", currencyCode);
      assert.ok(prices.some((entry) => text(entry[2]) === expectedItem), "Actual formatted item text, not only a currency attribute");
      const expectedTotal = currencyCode === "COP" ? "$3,699,000" : baseline(cart.grandTotal, currencyCode);
      assert.ok(prices.some((entry) => text(entry[2]) === expectedTotal), "The supplied total keeps the same actual currency and value");
      assert.equal(JSON.stringify(cart), original, "No totals/items/IDs changed while rendering");
    }
  });
}

test("catalog cards inherit the tenant only when product currency is absent, and preserve explicit foreign prices", () => {
  const load = commerceLoader();
  const Products = load("src/components/catalog/product/ProductGridItems.tsx").default;
  const { StorefrontCurrencyProvider } = load(providerFile);
  const product = { id: "9", name: "Producto", urlKey: "local", type: "simple", price: "3499000.00", isSaleable: true };
  const render = (priceHtml) => renderToStaticMarkup(React.createElement(StorefrontCurrencyProvider, { currencyCode: "COP" }, React.createElement(Products, { products: [{ ...product, priceHtml }] })));
  assert.match(render(undefined), />\$3,499,000<\/p>/);
  assert.match(render({ currencyCode: "MXN" }), />\$3,499,000\.00<\/p>/);
  const helper = sourceLoader({ mocks: { "./constants": { BASE_URL: "" }, "@utils/useAddress": { useAddress() {} } } })("src/utils/helper.ts");
  assert.equal(helper.safeCurrencyCode(product), undefined, "PDP must not invent USD before Price receives channel context");
  assert.equal(helper.safeCurrencyCode({ ...product, priceHtml: { currencyCode: "MXN" } }), "MXN");
});

test("historical COD orders use their explicit currency only, never the current channel for unknown legacy orders", () => {
  const baseOrder = { order_id: "91", order_number: "LOCAL", product_title: "Sintético", created_at: "2026-10-01T00:00:00Z", customer: { name: "Fixture" }, subtotal: 3499000, shipping_total: 0, cod_fee_total: 0, grand_total: 3499000, payment_status: "paid" };
  for (const currency_code of [undefined, null, "COP", "MXN"]) {
    const order = { ...baseOrder, currency_code };
    const before = JSON.stringify(order);
    const load = commerceLoader({ order });
    const Orders = load("src/components/portal/cod/CodOrdersPanel.tsx").default;
    const { StorefrontCurrencyProvider } = load(providerFile);
    const html = renderToStaticMarkup(React.createElement(StorefrontCurrencyProvider, { currencyCode: "COP" }, React.createElement(Orders)));
    if (currency_code == null) { assert.doesNotMatch(html, /data-currency=/); assert.equal((text(html).match(/—/g) || []).length, 4); }
    else assert.ok(html.includes(currency_code === "COP" ? "$3,499,000" : "$3,499,000.00"));
    assert.equal(JSON.stringify(order), before);
  }
});
