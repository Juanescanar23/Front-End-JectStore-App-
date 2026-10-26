import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
// Fixed pre-remediation source: committing this change must not turn the
// before/after comparison into a comparison against the same new component.
const baselineReference = "3570fccf5842b8ea6ed3da1c21cd23aea0975fc9";
const files = {
  categories: "src/components/home/CategoryCarousel.tsx",
  products: "src/components/home/ProductCarousel.tsx",
  sort: "src/components/theme/filters/SortOrder.tsx",
  guest: "src/utils/hooks/useGuestCartToken.ts",
  checkout: "src/components/cod/CodQuickCheckout.tsx",
  orders: "src/components/portal/cod/CodOrdersPanel.tsx",
  settings: "src/components/portal/cod/CodSettingsPanel.tsx",
};
const historicalSources = JSON.parse(readFileSync(new URL("./fixtures/frontend-baselines.json", import.meta.url), "utf8")).snapshots;
const source = (file, baseline) => {
  if (!baseline) return readFileSync(path.join(root, file), "utf8");
  const snapshot = historicalSources.find((entry) => entry.reference === baselineReference && entry.path === file);
  assert.ok(snapshot, `Missing immutable baseline: ${file}`);
  assert.equal(createHash("sha256").update(snapshot.source).digest("hex"), snapshot.sha256, `Baseline hash mismatch: ${file}`);
  return snapshot.source;
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const nodes = (tree, predicate) => {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
};
const text = (tree) => typeof tree === "string" ? tree
  : Array.isArray(tree) ? tree.map(text).join("")
    : tree && typeof tree === "object" ? text(tree.props?.children) : "";

function fixture(file, baseline, { graphql, request, cookies = {}, initialSearch = "" } = {}) {
  const hooks = [];
  let cursor = 0;
  let dirty = false;
  let search = new URLSearchParams(initialSearch);
  let tree;
  let component;
  let props;
  const calls = [];
  const navigation = [];
  const notices = [];
  const listeners = new Map();
  const document = {
    body: { style: { overflow: "" } }, activeElement: null,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  const focusable = [0, 1].map(() => ({
    hasAttribute: () => false,
    focus() { document.activeElement = this; },
  }));
  const element = (type, props) => {
    if (props?.ref) props.ref.current = { querySelectorAll: () => focusable };
    return { type, props: props || {} };
  };
  const changed = (previous, next) => !previous || !next || next.some((value, index) => value !== previous[index]);
  const react = {
    useState(initial) {
      const index = cursor++;
      hooks[index] ||= { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, (next) => {
        const value = typeof next === "function" ? next(hooks[index].value) : next;
        if (!Object.is(value, hooks[index].value)) { hooks[index].value = value; dirty = true; }
      }];
    },
    useMemo(callback, deps) {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].deps, deps)) hooks[index] = { deps, value: callback() };
      return hooks[index].value;
    },
    useRef(initial) {
      const index = cursor++;
      hooks[index] ||= { value: { current: initial } };
      return hooks[index].value;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = hooks[index];
      hooks[index] = { ...previous, deps, callback, pending: previous?.pending || changed(previous?.deps, deps) };
    },
  };
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options: plain(options) });
    assert.ok(request, `Unexpected network request: ${url}`);
    const response = await request(url, options);
    return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.body };
  };
  const constants = { SORT: "sort", NOT_IMAGE: "fixture-image", ORDER_ID: "order", GUEST_CART_TOKEN: "token", GUEST_CART_ID: "cart", IS_GUEST: "guest" };
  const dependencies = {
    react,
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "next/navigation": { useRouter: () => ({ replace: (url) => navigation.push(url), push: (url) => navigation.push(url) }), useSearchParams: () => search, usePathname: () => "/search" },
    "@/utils/hooks/useToast": { useCustomToast: () => ({ showToast: (...args) => notices.push(args) }) },
    "@/utils/helper": { createUrl: (url, query) => `${url}?${query}`, setCookie: (name, value) => { cookies[name] = value; } },
    "../getCartToken": { getNativeCookie: (name) => cookies[name] ?? null, setCookie: (name, value) => { cookies[name] = value; }, deleteCookie: (name) => { delete cookies[name]; } },
    "@/utils/jwt-cookie": { encodeJWT: JSON.stringify, decodeJWT: (value) => JSON.parse(value) },
    "../fetch-handler": { fetchHandler: async (options) => { calls.push(options); return { data: { createCartToken: { cartToken: { sessionToken: "raw-fixture-token", id: 7, isGuest: true } } } }; } },
    "../../lib/graphql-fetch": { graphqlRequestNoCache: async (...args) => { calls.push(args); return graphql(...args); } },
    "@/utils/storefront-filters": { buildStorefrontFilterInput: ({ base }) => base, resolveSortToStorefrontFilters: (sort) => ({ sort }) },
    "@/utils/server/storefront-currency": { getStorefrontCurrencyCode: async () => "USD" },
    "@heroui/react": { Drawer: "Drawer", DrawerContent: "DrawerContent", DrawerHeader: "DrawerHeader", DrawerBody: "DrawerBody", Button: "Button", useDisclosure: () => ({ isOpen: true, onOpen() {}, onOpenChange() { navigation.push("drawer-close"); } }) },
    "@/utils/constants": constants,
    clsx: { default: (...args) => args.filter(Boolean).join(" "), __esModule: true },
  };
  const fixtureModule = { exports: {} };
  const compiled = ts.transpileModule(source(file, baseline), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, {
    module: fixtureModule, exports: fixtureModule.exports, fetch: fakeFetch, document, URLSearchParams,
    console: { error() {}, warn() {} },
    require: (id) => dependencies[id] || new Proxy({}, { get: (_, key) => key === "__esModule" ? true : String(key) }),
  }, { filename: file });
  component = fixtureModule.exports.default || fixtureModule.exports.useGuestCartToken;
  const render = (nextProps = props) => {
    props = nextProps;
    for (let attempt = 0; attempt < 12; attempt++) {
      dirty = false;
      cursor = 0;
      tree = component(props);
      if (!dirty) return tree;
    }
    assert.fail("Render adjustment failed to converge");
  };
  const settle = async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      for (const hook of hooks.filter((hook) => hook?.pending)) {
        hook.pending = false;
        hook.cleanup?.();
        hook.cleanup = hook.callback();
      }
      await new Promise(setImmediate);
      render();
      if (!hooks.some((hook) => hook?.pending)) return tree;
    }
    assert.fail("Effects failed to settle");
  };
  return { render, settle, calls, navigation, notices, cookies, document, listeners, get tree() { return tree; }, setSearch(value) { search = new URLSearchParams(value); } };
}

test("category fetch failure/empty state and ordering stay identical outside JSX try/catch", async () => {
  for (const data of [null, { homeCategories: [] }, { homeCategories: [4, 1, 3, 2, 5].map((id) => ({ id: String(id), position: id, slug: `category-${id}`, name: `Category${id}` })) }]) {
    const outputs = [];
    for (const baseline of [true, false]) {
      const view = fixture(files.categories, baseline, { graphql: async () => { if (data === null) throw Error("fixture"); return data; } });
      outputs.push(plain(await view.render({ options: { filters: {} } })));
    }
    assert.deepEqual(outputs[1], outputs[0]);
  }
});

test("product filters, empty/error fallback, eight-item cap and three-grid mode are preserved apart from authoritative currency", async () => {
  for (const mode of ["error", "empty", "grid", "carousel"]) {
    const outputs = [];
    for (const baseline of [true, false]) {
      const view = fixture(files.products, baseline, { graphql: async () => {
        if (mode === "error") throw Error("fixture");
        return { products: { data: mode === "empty" ? [] : Array.from({ length: 10 }, (_, id) => ({ id: String(id), sku: `sku${id}`, price: id, cacheBaseImage: { originalImageUrl: `image${id}` } })) } };
      } });
      const tree = plain(await view.render({ options: { filters: [{ key: "limit", value: "6" }, { key: "sort", value: "price-asc" }] }, sortOrder: mode === "grid" ? 2 : 1 }));
      if (!baseline && tree) { assert.equal(tree.props.currency, "USD"); delete tree.props.currency; }
      outputs.push({ tree, calls: plain(view.calls) });
    }
    assert.deepEqual(outputs[1], outputs[0]);
  }
});

test("mobile draft sort survives editing, follows URL navigation and applies only on action", async () => {
  const outputs = [];
  for (const baseline of [true, false]) {
    const view = fixture(files.sort, baseline, { initialSearch: "q=shoes&sort=name-asc" });
    const mobileSelect = () => {
      const drawer = nodes(view.tree, (node) => node.type === "DrawerContent")[0];
      return nodes(drawer.props.children(() => {}), (node) => node.type === "Select")[0];
    };
    view.render({ sortOrders: [], title: "Ordenar" });
    await view.settle();
    mobileSelect().props.onSelectionChange({ currentKey: "price-desc" });
    view.render();
    assert.deepEqual(plain(mobileSelect().props.selectedKeys), ["price-desc"]);
    assert.equal(view.navigation.length, 0);
    view.setSearch("q=shoes&sort=name-desc");
    view.render();
    await view.settle();
    assert.deepEqual(plain(mobileSelect().props.selectedKeys), ["name-desc"]);
    const drawer = nodes(view.tree, (node) => node.type === "DrawerContent")[0];
    const body = drawer.props.children(() => {});
    nodes(body, (node) => node.type === "Button" && text(node).includes("Aplicar filtro"))[0].props.onPress();
    outputs.push(view.navigation);
  }
  assert.deepEqual(outputs[1], outputs[0]);
  assert.deepEqual(outputs[1], ["/search?q=shoes&sort=name-desc", "drawer-close"]);
});

test("guest cookie hydration and explicit token reset remain browser-only, with no mount request", async () => {
  const outputs = [];
  for (const baseline of [true, false]) {
    const view = fixture(files.guest, baseline, { cookies: { token: JSON.stringify({ sessionToken: "existing", cartId: 3 }), guest: "true" } });
    assert.equal(view.render().isReady, false);
    assert.equal(view.tree.token, null);
    await view.settle();
    assert.equal(view.tree.token, "existing");
    assert.equal(view.tree.cartId, 3);
    assert.equal(view.calls.length, 0);
    await view.tree.resetGuestToken();
    view.render();
    outputs.push({ token: view.tree.token, cartId: view.tree.cartId, isReady: view.tree.isReady, cookies: view.cookies, calls: view.calls });
  }
  assert.deepEqual(plain(outputs[1]), plain(outputs[0]));
  assert.equal(outputs[1].token, "raw-fixture-token");
});

const checkoutConfig = () => ({
  allowed_by_plan: true, cod_active: true, available: true,
  modal: { modal_enabled: true, modal_cta_text: "Comprar", modal_helper_text: "Fixture" },
  product_snapshot: { id: 11, title: "Fixture product", currency_code: "CO", base_price: 12, attributes: [], has_variants: false, variant_index: {} },
  rules: { countries: [], allowed_shipping_methods: [] }, fee: { type: "none", value: 0 }, fields: { require_whatsapp: false, require_email: false },
  shipping_methods: [{ code: "fixture-shipping", price: 0 }], offers: [],
});
const checkoutRequest = (config) => async (url) => {
  if (url.startsWith("/api/checkout/cod/config")) return { status: 200, body: config };
  if (url === "/api/locations/countries") return { status: 200, body: { countries: [{ code: "CO", name: "CO" }, { code: "MX", name: "MX" }] } };
  if (url.includes("/regions")) return { status: 200, body: { regions: [{ id: "r1", name: "Region" }] } };
  if (url.includes("/cities")) return { status: 200, body: { cities: [{ id: "c1", name: "City" }] } };
  assert.fail(`Checkout must not submit an order in these fixtures: ${url}`);
};

test("COD keyboard/modal and dependent address resets retain the original flow without orders", async () => {
  const outputs = [];
  for (const baseline of [true, false]) {
    const config = checkoutConfig();
    const view = fixture(files.checkout, baseline, { request: checkoutRequest(config) });
    view.render({ productId: 11 });
    await view.settle();
    nodes(view.tree, (node) => node.type === "button" && text(node) === "Comprar")[0].props.onClick();
    view.render();
    await view.settle();
    assert.equal(view.document.body.style.overflow, "hidden");
    nodes(view.tree, (node) => node.type === "button" && text(node) === "Continuar")[0].props.onClick();
    view.render();
    await view.settle();
    let selects = nodes(view.tree, (node) => node.type === "select");
    assert.equal(selects.length, 3);
    selects[0].props.onChange({ target: { value: "" } });
    view.render();
    await view.settle();
    selects = nodes(view.tree, (node) => node.type === "select");
    assert.equal(nodes(selects[1], (node) => node.type === "option").length, 1);
    assert.equal(nodes(selects[2], (node) => node.type === "option").length, 1);
    selects[0].props.onChange({ target: { value: "MX" } });
    view.render();
    await view.settle();
    selects = nodes(view.tree, (node) => node.type === "select");
    selects[1].props.onChange({ target: { value: "" } });
    view.render();
    await view.settle();
    assert.equal(nodes(nodes(view.tree, (node) => node.type === "select")[2], (node) => node.type === "option").length, 1);
    view.listeners.get("keydown")({ key: "Escape", preventDefault() {} });
    view.render();
    await view.settle();
    assert.equal(view.document.body.style.overflow, "");
    assert.equal(view.listeners.has("keydown"), false);
    assert.equal(nodes(view.tree, (node) => node.props?.role === "dialog").length, 0);
    outputs.push(view.calls);
  }
  assert.deepEqual(plain(outputs[1]), plain(outputs[0]));
});

test("COD per-unit variants retain, append, truncate and clear exactly as the original effect", async () => {
  const outputs = [];
  for (const baseline of [true, false]) {
    const config = checkoutConfig();
    config.product_snapshot.has_variants = true;
    config.product_snapshot.attributes = [{ code: "color", label: "Color", options: [{ id: 8, label: "Red" }] }];
    config.offers = [2, 3].map((units) => ({ id: units, status: true, units_count: units, selection_strategy: "per_unit_variant", required_attributes: ["color"] }));
    const view = fixture(files.checkout, baseline, { request: checkoutRequest(config) });
    view.render({ productId: 11 });
    await view.settle();
    nodes(view.tree, (node) => node.type === "button" && text(node) === "Comprar")[0].props.onClick();
    view.render();
    await view.settle();
    const selectOffer = async (index) => {
      nodes(view.tree, (node) => node.type === "input" && node.props.name === "cod-offer")[index].props.onChange();
      view.render(); await view.settle();
    };
    await selectOffer(1);
    nodes(view.tree, (node) => node.type === "select")[0].props.onChange({ target: { value: "8" } });
    view.render();
    const snapshots = [];
    for (const index of [2, 1, 0, 1]) {
      await selectOffer(index);
      snapshots.push(nodes(view.tree, (node) => node.type === "select").map((node) => node.props.value));
    }
    outputs.push(snapshots);
  }
  assert.deepEqual(plain(outputs[1]), plain(outputs[0]));
  assert.deepEqual(plain(outputs[1]), [[8, "", ""], [8, ""], [""], ["", ""]]);
});

test("switching to another nonempty country clears old cities while its region request is still pending", async () => {
  for (const baseline of [true, false]) {
    const config = checkoutConfig();
    let releaseRegions;
    const fallback = checkoutRequest(config);
    const view = fixture(files.checkout, baseline, { request: async (url) => {
      if (url === "/api/locations/MX/regions") return new Promise((resolve) => { releaseRegions = resolve; });
      return fallback(url);
    } });
    view.render({ productId: 11 }); await view.settle();
    nodes(view.tree, (node) => node.type === "button" && text(node) === "Comprar")[0].props.onClick();
    view.render(); await view.settle();
    nodes(view.tree, (node) => node.type === "button" && text(node) === "Continuar")[0].props.onClick();
    view.render(); await view.settle();
    let selects = nodes(view.tree, (node) => node.type === "select");
    assert.equal(nodes(selects[2], (node) => node.type === "option").length, 2);
    selects[0].props.onChange({ target: { value: "MX" } });
    view.render(); await view.settle();
    selects = nodes(view.tree, (node) => node.type === "select");
    assert.equal(selects[1].props.value, "");
    assert.equal(selects[2].props.value, "");
    assert.equal(nodes(selects[2], (node) => node.type === "option").length, 1);
    assert.equal(typeof releaseRegions, "function");
    releaseRegions({ status: 200, body: { regions: [{ id: "mx1", name: "MX region" }] } });
    await view.settle();
    assert.ok(view.calls.every((call) => call.options.method === "GET"));
  }
});

test("COD settings plan denial and editable server draft hydration stay unchanged", async () => {
  for (const status of [200, 403]) {
    const outputs = [];
    for (const baseline of [true, false]) {
      const view = fixture(files.settings, baseline, { request: async () => ({ status, body: { allowed_by_plan: status === 200, settings: { countries: ["CO"], plan_name: "fixture", allowed_shipping_methods: [], title: "Fixture", active: false } } }) });
      view.render(); await view.settle();
      outputs.push({ text: text(view.tree), calls: view.calls });
    }
    assert.deepEqual(plain(outputs[1]), plain(outputs[0]));
  }
});

test("COD paid action keeps POST then refresh ordering and never fabricates payment state", async () => {
  const outputs = [];
  for (const baseline of [true, false]) {
    const order = { order_id: "fixture-order", created_at: "2026-10-09T00:00:00Z", customer: {}, payment_status: "pending", subtotal: 5, shipping_total: 0, cod_fee_total: 0, grand_total: 5 };
    let marked = false;
    const view = fixture(files.orders, baseline, { request: async (url, options) => {
      if (options.method === "POST") { assert.equal(url, "/api/portal/orders/fixture-order/cod/mark-paid"); marked = true; return { status: 200, body: {} }; }
      return { status: 200, body: { orders: [{ ...order, payment_status: marked ? "paid" : "pending" }] } };
    } });
    view.render(); await view.settle();
    await nodes(view.tree, (node) => node.type === "button")[0].props.onClick();
    view.render(); await view.settle();
    assert.ok(text(view.tree).includes("Pago realizado"));
    assert.equal(nodes(view.tree, (node) => node.type === "button").length, 0);
    outputs.push({ calls: view.calls, notices: view.notices });
  }
  assert.deepEqual(plain(outputs[1]), plain(outputs[0]));
  assert.deepEqual(outputs[1].calls.map((call) => call.options.method), ["GET", "POST", "GET"]);
});
