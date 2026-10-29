import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { experience, nextDocument } from "./fixtures/storefront-experience.mjs";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");
function loadSource(relative, mocks = {}) {
  const source = resolve(root, relative);
  const file = [source, `${source}.ts`, `${source}.tsx`].find(candidate => existsSync(candidate));
  assert.ok(file, `Missing source: ${relative}`);
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith(".")) return loadSource(resolve(dirname(file), name), mocks);
    if (name.startsWith("@/")) return loadSource(`src/${name.slice(2)}`, mocks);
    return require(name);
  };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const documentApi = loadSource("src/lib/storefront-experience/document.ts");
const runtime = loadSource("src/lib/storefront-experience/runtime.ts");
const KEY = "local-fixture-runtime-signing-key-not-a-secret";
const NOW = 1793059200;
const HOST = "a.jectstore.test";
const pin = (overrides = {}) => ({ v: 1, host: HOST, base_key: "next-current", published_revision_id: 11, issued_at: NOW, expires_at: NOW + 3600, ...overrides });
function env(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}

test("Next document accepts the actual component contract, Unicode and omitted filters", () => {
  const doc = nextDocument();
  doc.sections[1].settings.filters = { featured: "", new: "", category_id: null, sort: "", order: "", limit: 4 };
  assert.deepEqual(documentApi.parseNextStorefrontDocument(doc), doc);
  assert.equal(documentApi.nextBannerHref("category/nested"), "/search/category/nested");
  assert.equal(documentApi.nextBannerHref("/search/nested?q=one"), "/search/nested?q=one");
});

test("editorial limits count Unicode code points exactly like PHP mb_strlen", () => {
  const doc = nextDocument();
  doc.regions.header.settings.brand_name = "🛍️".repeat(40);
  assert.equal(doc.regions.header.settings.brand_name.length, 120, "UTF-16 units are not the contract limit");
  assert.equal(Array.from(doc.regions.header.settings.brand_name).length, 80);
  assert.deepEqual(documentApi.parseNextStorefrontDocument(doc), doc);
  doc.regions.header.settings.brand_name += "a";
  assert.throws(() => documentApi.parseNextStorefrontDocument(doc), /brand_name/);
});

test("opaque preview can load only public static resources without relaxing private document/API policies", () => {
  const { configHeader } = loadSource("src/utils/constants.ts");
  const publicPaths = ["/_next/static/:path*", "/image/:path*", "/brand/jectstore-logo.svg"];
  for (const rule of configHeader) {
    const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));
    if (publicPaths.includes(rule.source)) {
      assert.equal(headers["Cross-Origin-Resource-Policy"], "cross-origin");
      assert.equal(headers["Access-Control-Allow-Origin"], "*");
    } else assert.equal(headers["Access-Control-Allow-Origin"], undefined, rule.source);
    assert.equal(headers["Access-Control-Allow-Credentials"], undefined);
  }
  assert.equal(configHeader[0].headers.find(({ key }) => key === "Cross-Origin-Resource-Policy").value, "same-site");
  const footer = readFileSync(resolve(root, "src/components/layout/footer/index.tsx"), "utf8");
  assert.doesNotMatch(footer, /aria-label=["'][^"']*Bagisto/);
});

test("actual cart cookie readers tolerate an opaque sandbox without reading or creating a session", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  t.after(() => { if (previous) Object.defineProperty(globalThis, "document", previous); else delete globalThis.document; });
  const cookies = loadSource("src/utils/getCartToken.ts", {
    "@/utils/constants": { GUEST_CART_TOKEN: "guest_cart_token", IS_GUEST: "isGuest" },
    "@/utils/jwt-cookie": { decodeJWT: () => null },
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "fixture=hello%20world; untouched=1" } });
  assert.equal(cookies.getNativeCookie("fixture"), "hello world");
  assert.equal(cookies.getCookie("fixture"), "hello world");
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    get cookie() { throw new DOMException("Sandbox denies cookie access", "SecurityError"); },
    set cookie(_value) { assert.fail("Rendering a sandboxed preview must not write cookies"); },
  } });
  assert.equal(cookies.getNativeCookie("fixture"), null);
  assert.equal(cookies.getCookie("fixture"), null);
  assert.equal(cookies.getCartToken(), null);
});

test("Next document rejects unsupported capabilities rather than silently dropping them", () => {
  const mutations = [
    (doc) => { doc.template = "visual-debut"; },
    (doc) => { doc.schema_version = 2; },
    (doc) => { doc.css = "body{}"; },
    (doc) => { doc.sections[0].id = doc.sections[1].id; },
    (doc) => { doc.sections[0].type = "custom_html"; },
    (doc) => { doc.regions.header.visible = false; },
    (doc) => { doc.sections[1].settings.filters.channel_id = "2"; },
    (doc) => { doc.sections[1].settings.filters.limit = 12; },
    (doc) => { doc.sections[1].settings.filters.sort = "random_sql"; },
    (doc) => { doc.sections[2].settings.category_ids = [2, 3, 4, 5]; },
  ];
  for (const mutate of mutations) { const doc = nextDocument(); mutate(doc); assert.throws(() => documentApi.parseNextStorefrontDocument(doc)); }
});

test("editorial URLs reject scripts, protocol-relative links, controls and foreign navigation", () => {
  for (const value of ["javascript:alert(1)", "//outside.test", "/\\outside.test", "/x%0d%0aSet-Cookie:x", "https://outside.test"]) {
    const doc = nextDocument(); doc.regions.header.settings.menu_links[0].url = value;
    assert.throws(() => documentApi.parseNextStorefrontDocument(doc), value);
  }
  for (const image of ["javascript:alert(1)", "data:image/svg+xml,test", "https://user:password@outside.test/x", "http://outside.test/x"]) {
    const doc = nextDocument(); doc.sections[0].settings.images[0].image = image;
    assert.throws(() => documentApi.parseNextStorefrontDocument(doc), image);
  }
});

test("experience envelope distinguishes explicit legacy Next, published Next and native Visual", () => {
  assert.equal(runtime.parseStorefrontExperience(experience()).document.template, "next-current");
  assert.equal(runtime.parseStorefrontExperience(experience({ version: 0, published_revision_id: null, document: null })).document, null);
  assert.equal(runtime.parseStorefrontExperience(experience({ engine: "visual", base_key: "visual-debut", document: null })).engine, "visual");
  for (const overrides of [{ document: null }, { engine: "visual" }, { schema_version: 2 }, { published_revision_id: null }, { preview: true }, { currency: "" }, { currency: null }]) {
    assert.throws(() => runtime.parseStorefrontExperience(experience(overrides)));
  }
  assert.equal(runtime.parseStorefrontExperience(experience({ preview: true, published_revision_id: null }), true).preview, true);
});

test("signed engine pin binds host, base, release, timestamp and maximum lifetime", () => {
  const signed = runtime.encodeExperiencePin(pin(), KEY);
  assert.deepEqual(runtime.decodeExperiencePin(signed, HOST, KEY, NOW), pin());
  assert.equal(runtime.decodeExperiencePin(signed, "b.jectstore.test", KEY, NOW), null);
  assert.equal(runtime.decodeExperiencePin(`${signed.slice(0, -1)}${signed.endsWith("a") ? "b" : "a"}`, HOST, KEY, NOW), null);
  assert.equal(runtime.decodeExperiencePin(signed, HOST, `${KEY}other`, NOW), null);
  for (const override of [{ issued_at: NOW + 60 }, { expires_at: NOW }, { expires_at: NOW + 86401 }, { mode: "request", expires_at: NOW + 61 }, { mode: "administrator" }, { published_revision_id: 0 }, { base_key: "visual-debut", published_revision_id: null }, { administrator: true }]) {
    assert.equal(runtime.decodeExperiencePin(runtime.encodeExperiencePin(pin(override), KEY), HOST, KEY, NOW), null);
  }
  const [payload, signature] = signed.split(".");
  assert.equal(signature, createHmac("sha256", KEY).update(`jectstore.experience.pin.v1\n${payload}`).digest("hex"), "Shared PHP/Node wire format");
});

test("session pins advance only with backend authorization while request pins freeze the exact revision", () => {
  const snapshot = runtime.parseStorefrontExperience(experience());
  const previous = pin({ published_revision_id: null });
  assert.throws(() => runtime.pinForExperience(snapshot, HOST, previous, NOW + 40));
  assert.deepEqual(runtime.pinForExperience({ ...snapshot, continuity_advanced_from: null }, HOST, previous, NOW + 40), pin({ mode: "session" }));
  assert.throws(() => runtime.pinForExperience({ ...snapshot, published_revision_id: 12 }, HOST, pin()));
  const advanced = runtime.pinForExperience({ ...snapshot, published_revision_id: 12, continuity_advanced_from: 11 }, HOST, pin());
  assert.equal(advanced.published_revision_id, 12); assert.equal(advanced.expires_at, pin().expires_at);
  assert.throws(() => runtime.pinForExperience({ ...snapshot, published_revision_id: 12, continuity_advanced_from: 11 }, HOST, pin({ mode: "request" })));
  const request = runtime.requestPinForExperience(snapshot, HOST, NOW);
  assert.equal(request.mode, "request"); assert.equal(request.expires_at - request.issued_at, 60);
  assert.throws(() => runtime.pinForExperience({ ...snapshot, base_key: "visual-debut" }, HOST, pin()));
});

test("legacy guest transport unwraps only the server token and never trusts browser cart identity", () => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64");
  const wrap = (fields) => encodeURIComponent(`${header}.${Buffer.from(encodeURIComponent(JSON.stringify(fields))).toString("base64")}.guest`);
  for (const cartId of [1, 999999]) {
    assert.equal(runtime.legacyGuestProof(wrap({ sessionToken: "server-signed.token", cartId, isGuest: false })), "server-signed.token");
  }
  assert.equal(runtime.legacyGuestProof("server-signed.token"), "server-signed.token");
  assert.throws(() => runtime.legacyGuestProof(wrap({ cartId: 1, isGuest: true })), /guest-cookie/);
  assert.throws(() => runtime.legacyGuestProof(wrap({ sessionToken: "token\r\nheader" })), /guest-cookie/);
});

test("network origins come only from configuration and reject credentials/insecure remote origins", (t) => {
  env(t, { STOREFRONT_BACKEND_ORIGIN: "http://127.0.0.1:9123", STOREFRONT_NATIVE_ORIGIN: "http://127.0.0.1:9124" });
  assert.equal(runtime.configuredOrigin("backend").origin, "http://127.0.0.1:9123");
  for (const origin of ["http://outside.test", "https://user:secret@outside.test", "https://outside.test/path", "https://outside.test?target=foo", "file:///tmp/fixture"]) {
    process.env.STOREFRONT_BACKEND_ORIGIN = origin;
    assert.throws(() => runtime.configuredOrigin("backend"));
  }
  const destination = runtime.nativeDestination("/category/example", "?q=hello%20world");
  assert.equal(destination.href, "http://127.0.0.1:9124/category/example?q=hello%20world");
  assert.throws(() => runtime.nativeDestination("//outside.test", ""));
});

test("pilot routing requires both the feature flag and an exact canonical host opt-in", (t) => {
  env(t, { STOREFRONT_EXPERIENCES_ENABLED: "true", STOREFRONT_EXPERIENCE_HOSTS: "" });
  assert.equal(runtime.experiencesEnabledForHost(HOST), false);
  process.env.STOREFRONT_EXPERIENCE_HOSTS = `*.jectstore.test,https://${HOST},${HOST}:443`;
  assert.equal(runtime.experiencesEnabledForHost(HOST), false);
  process.env.STOREFRONT_EXPERIENCE_HOSTS = `${HOST}, b.jectstore.test`;
  assert.equal(runtime.experiencesEnabledForHost(HOST), true);
  assert.equal(runtime.experiencesEnabledForHost("not-a.jectstore.test"), false);
  process.env.STOREFRONT_EXPERIENCES_ENABLED = "false";
  assert.equal(runtime.experiencesEnabledForHost(HOST), false);
});

test("untrusted forwarded and internal selector headers cannot choose a tenant/engine", () => {
  const headers = runtime.safeRequestHeaders(new Headers({
    host: HOST, "x-tenant-host": "b.test", "x-forwarded-host": "b.test", "forwarded": "host=b.test",
    "x-jectstore-experience-pin": "forged", "x-jectstore-native-host": "b.test", "x-jectstore-request-selection": "forged",
    cookie: "fixture=value", rsc: "1", "next-action": "fixture-action",
  }), HOST, "https:");
  assert.equal(headers.get("x-forwarded-host"), HOST);
  assert.equal(headers.get("x-tenant-host"), HOST);
  assert.equal(headers.get("x-jectstore-native-host"), null);
  assert.equal(headers.get("x-jectstore-request-selection"), null);
  assert.equal(headers.get("forwarded"), null);
  assert.equal(headers.get("rsc"), "1");
  assert.equal(headers.get("cookie"), "fixture=value");
});

test("native request authority preserves the validated ingress port without changing tenant identity", () => {
  for (const [incoming, expected] of [["Fashion.Localhost:8089", "fashion.localhost:8089"], ["shop.test:443", "shop.test:443"], ["shop.test:80", "shop.test:80"], ["shop.test", "shop.test"], ["shop.test.:8089", "shop.test:8089"]]) {
    assert.equal(runtime.experienceRequestAuthority(incoming), expected);
    assert.equal(runtime.canonicalExperienceHost(incoming), expected.split(":")[0]);
  }
  for (const invalid of [null, "", "shop.test:", "shop.test:0", "shop.test:65536", "shop.test:abc", "shop.test:8089,evil.test", "https://shop.test:8089", "user@shop.test:8089", "shop.test:8089/evil", "shop.test:8089\r\nx-tenant-host:evil.test"]) {
    assert.throws(() => runtime.experienceRequestAuthority(invalid), /host/);
  }
});

const query = () => "tenant=fixture&host=a.jectstore.test&channel=1&locale=es&page=7&version=2&actor=1&session=fixture-session-hmac&expires=1793062800&signature=fixture-signature&_editor_preview=fixture-nonce";
test("preview accepts only the signed fixed-endpoint query, preserving signature byte order", () => {
  assert.equal(runtime.validatePreviewQuery(`?${query()}`), query());
  for (const bad of [`${query()}&url=https://outside.test`, `${query()}&version=3`, "signature=x", `${query()}&x-tenant-host=b.test`]) {
    assert.throws(() => runtime.validatePreviewQuery(bad));
  }
});

test("public fetch is no-store, fixed-target, redirect-denying and does not forward browser credentials", async (t) => {
  env(t, { STOREFRONT_BACKEND_ORIGIN: "http://127.0.0.1:9123" });
  let called;
  const result = await runtime.fetchStorefrontExperience({ host: HOST, pin: "fixture-pin", incoming: new Headers({ cookie: "private-cookie", "x-tenant-host": "b.test" }), fetcher: async (url, options) => {
    called = { url: String(url), options };
    return Response.json(experience());
  } });
  assert.equal(result.base_key, "next-current");
  assert.equal(called.url, "http://127.0.0.1:9123/api/storefront/experience");
  assert.equal(called.options.cache, "no-store");
  assert.equal(called.options.redirect, "error");
  assert.equal(called.options.headers.get("host"), HOST);
  assert.equal(called.options.headers.get("cookie"), null);
  assert.equal(called.options.headers.get("x-jectstore-experience-pin"), "fixture-pin");
});

test("preview forwards the admin cookie only to the fixed backend and binds the signed host", async (t) => {
  env(t, { STOREFRONT_BACKEND_ORIGIN: "http://127.0.0.1:9123" });
  await runtime.fetchStorefrontExperience({ host: HOST, previewQuery: query(), incoming: new Headers({ cookie: "fixture-admin-session" }), fetcher: async (url, options) => {
    assert.equal(new URL(url).pathname, "/api/storefront/next-preview");
    assert.equal(options.headers.get("cookie"), "fixture-admin-session");
    return Response.json(experience({ published_revision_id: null, preview: true }));
  } });
  await assert.rejects(() => runtime.fetchStorefrontExperience({ host: "b.jectstore.test", previewQuery: query(), fetcher: async () => { throw new Error("Must not fetch"); } }), /preview-host/);
});

test("backend errors, malformed documents and oversized bodies fail closed without legacy fallback", async (t) => {
  env(t, { STOREFRONT_BACKEND_ORIGIN: "http://127.0.0.1:9123" });
  for (const response of [new Response("no", { status: 403 }), Response.json({ data: {} }), new Response("<html>error</html>"), new Response(" ".repeat(262145), { headers: { "content-type": "application/json" } })]) {
    await assert.rejects(() => runtime.fetchStorefrontExperience({ host: HOST, fetcher: async () => response }), /unavailable/);
  }
});

test("actual fixed-origin HTTP transport preserves tenant Host and refuses redirects and empty responses", async (t) => {
  let destination = "valid";
  let observedHost;
  const provider = createServer((req, res) => {
    observedHost = req.headers.host;
    if (destination === "redirect") { res.writeHead(302, { Location: "https://outside.invalid/never-follow" }).end(); return; }
    if (destination === "empty") { res.writeHead(204).end(); return; }
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(experience()));
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => provider.close(resolve)));
  env(t, { STOREFRONT_BACKEND_ORIGIN: `http://127.0.0.1:${provider.address().port}` });
  assert.equal((await runtime.fetchStorefrontExperience({ host: HOST })).currency, "MXN");
  assert.equal(observedHost, HOST, "Unlike Node fetch, the explicit Host must survive transport");
  destination = "redirect"; await assert.rejects(() => runtime.fetchStorefrontExperience({ host: HOST }), /backend-302/);
  destination = "empty"; await assert.rejects(() => runtime.fetchStorefrontExperience({ host: HOST }), /backend-204/);
});

test("reserved API, admin, auth callbacks and assets never route as storefront HTML", () => {
  for (const path of ["/api/auth/callback/credentials", "/api/cart/addToCart", "/%61pi/cart/addToCart", "/graphql", "/admin/login", "/_next/static/x.js", "/themes/visual/app.css", "/storage/x.jpg", "/brand/logo.svg", "/portal", "/checkout/recover/1", "/__jectstore-native/admin"]) {
    assert.equal(runtime.isExperiencePage(path), false, path);
  }
  for (const path of ["/", "/product/item", "/cart", "/checkout", "/customer/login", "/search?q=one"]) assert.equal(runtime.isExperiencePage(path), true, path);
});

const element = (type, props) => ({ type, props: props || {} });
const componentMocks = {
  react: { Suspense: "Suspense" }, "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
  "./ImageCarousel": { default: "ImageCarousel", __esModule: true }, "./ProductCarousel": { default: "ProductCarousel", __esModule: true },
  "./CategoryCarousel": { default: "CategoryCarousel", __esModule: true }, "@/components/layout/navbar/MobileSearch": { MobileSearchBar: "MobileSearchBar" },
  "@/components/common/skeleton/CategoryCarouselSkeleton": { CategoryCarouselSkeleton: "CategorySkeleton" },
  "./StoreIntro": { default: "StoreIntro", __esModule: true },
};
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, type));
  if (!tree || typeof tree !== "object") return [];
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}

test("actual shared renderer preserves section order, explicit layout, visibility and editorial props", () => {
  const render = loadSource("src/components/home/RenderStorefrontDocument.tsx", componentMocks).default;
  const doc = nextDocument();
  const first = render({ document: doc, currency: "MXN" });
  assert.equal(nodes(first, "ProductCarousel")[0].props.layout, "three-item");
  assert.equal(nodes(first, "ProductCarousel")[0].props.currency, "MXN");
  assert.equal(nodes(first, "CategoryCarousel")[0].props.editorial.title, "Categorías editoriales");
  doc.sections.reverse();
  doc.sections[2].visible = false;
  const moved = render({ document: doc, currency: "MXN" });
  assert.equal(nodes(moved, "ImageCarousel").length, 0);
  assert.equal(nodes(moved, "ProductCarousel")[0].props.layout, "three-item", "Moving a section cannot change its layout");
  assert.deepEqual(nodes(moved, "div").map((node) => node.props["data-storefront-section-id"]), ["categories-1", "products-1"]);
});

test("typed store intro preserves legacy content and owns its spacing without extra mobile search", () => {
  const { STORE_INTRO_DEFAULTS } = loadSource("src/lib/storefront-experience/store-intro.ts");
  const doc = nextDocument();
  doc.sections = [{ id: "store-intro", type: "store_intro", visible: true, settings: { ...STORE_INTRO_DEFAULTS } }];
  assert.deepEqual(documentApi.parseNextStorefrontDocument(doc), doc);
  const render = loadSource("src/components/home/RenderStorefrontDocument.tsx", componentMocks).default;
  const tree = render({ document: doc, currency: "COP" });
  assert.equal(nodes(tree, "MobileSearchBar").length, 0);
  assert.equal(nodes(tree, "section").length, 0, "The intro owns its original section container");
  assert.deepEqual(nodes(tree, "StoreIntro")[0].props.settings, STORE_INTRO_DEFAULTS);
  const intro = loadSource("src/components/home/StoreIntro.tsx", { ...componentMocks, "next/link": { __esModule: true, default: "a" } }).default({ settings: STORE_INTRO_DEFAULTS });
  assert.equal(nodes(intro, "h1")[0].props.children, STORE_INTRO_DEFAULTS.heading);
  assert.deepEqual(nodes(intro, "a").map(link => [link.props.href, link.props.children]), [["/search", "Ver catálogo"], ["/customer/login", "Ingresar"]]);
  assert.equal(nodes(intro, "section")[0].props.className, "mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pb-24 lg:pt-16");
  doc.sections.push(nextDocument().sections[1], { ...doc.sections[0], id: "second-intro" }, nextDocument().sections[2]);
  const mixed = render({ document: doc, currency: "COP" });
  assert.deepEqual(nodes(mixed, "div").map(node => node.props["data-storefront-section-id"]), ["store-intro", "products-1", "second-intro", "categories-1"]);
  assert.equal(nodes(mixed, "MobileSearchBar").length, 1);
  assert.equal(nodes(mixed, "section").length, 2);
});

test("intro cannot become empty, executable markup, foreign navigation or arbitrary styles", () => {
  const { STORE_INTRO_DEFAULTS } = loadSource("src/lib/storefront-experience/store-intro.ts");
  const doc = nextDocument();
  doc.sections = [{ id: "store-intro", type: "store_intro", visible: true, settings: { ...STORE_INTRO_DEFAULTS } }];
  for (const [key, value] of [["heading", ""], ["primary_label", "  "], ["secondary_label", ""], ["body", "<script>unsafe</script>"], ["primary_url", "/%2foutside.test"], ["secondary_url", "https://outside.test"], ["css", "body{}"], ["html", "<b>override</b>"]]) {
    const invalid = structuredClone(doc); invalid.sections[0].settings[key] = value;
    assert.throws(() => documentApi.parseNextStorefrontDocument(invalid), key);
  }
  for (const url of ["/search?q=50%25", "/search?q=50%", "/search?q=hola%20mundo", "/search?q=%FF"]) {
    doc.sections[0].settings.primary_url = url;
    assert.equal(documentApi.parseNextStorefrontDocument(doc).sections[0].settings.primary_url, url);
  }
  for (const heading of ["\u00a0", "\ufeff", "\u0085"]) {
    doc.sections[0].settings.heading = heading;
    assert.throws(() => documentApi.parseNextStorefrontDocument(doc));
  }
});

test("request loader memoizes one backend revision for home and shell", async (t) => {
  env(t, { STOREFRONT_EXPERIENCES_ENABLED: "true", STOREFRONT_EXPERIENCE_HOSTS: HOST, STOREFRONT_RUNTIME_SIGNING_KEY: KEY });
  const current = Math.floor(Date.now() / 1000);
  const selection = runtime.encodeExperiencePin(pin({ mode: "request", issued_at: current, expires_at: current + 60 }), KEY);
  let count = 0;
  const loader = loadSource("src/lib/storefront-experience/server.ts", {
    "server-only": {}, react: { cache: (fn) => { let promise; return () => promise ??= fn(); } },
    "next/headers": { headers: async () => new Headers({ host: HOST, [runtime.EXPERIENCE_REQUEST_HEADER]: selection }) },
    "./runtime": { ...runtime, fetchStorefrontExperience: async () => { count++; return runtime.parseStorefrontExperience(experience()); } },
  });
  const [home, shell, footer] = await Promise.all([loader.getStorefrontExperience(), loader.getStorefrontExperience(), loader.getStorefrontExperience()]);
  assert.equal(count, 1); assert.equal(home, shell); assert.equal(shell, footer);
});

test("actual GraphQL cache scope uses verified channel/locale/engine/revision, not spoofed hint headers", async (t) => {
  env(t, { NODE_ENV: "production", STOREFRONT_REALTIME_MODE: "false", STOREFRONT_EXPERIENCES_ENABLED: "true", STOREFRONT_RUNTIME_SIGNING_KEY: KEY });
  let verified = runtime.parseStorefrontExperience(experience());
  const keys = []; const clients = [];
  const incoming = new Headers({ host: HOST, "x-jectstore-client-ip": "203.0.113.10", "x-tenant-host": "forged.test", "x-locale": "xx", "x-jectstore-experience-channel": "999", "x-jectstore-experience-revision": "999" });
  const graphql = loadSource("src/lib/graphql-fetch.ts", {
    "server-only": {},
    "next/cache": { unstable_cache: (fn, key) => { keys.push(key[0]); return fn; } },
    "next/headers": { headers: async () => incoming }, graphql: { print: () => "fixture-query" },
    "./apollo-client": { __esModule: true, default: (options) => { clients.push(options); return { query: async () => ({ data: { ok: true } }) }; } },
    "@/utils/constants": { GRAPHQL_URL: "http://127.0.0.1:9/graphql" },
    "@/utils/storefront-cache-scope": { canonicalCacheHostname: (host) => host, storefrontCacheTags: async (host) => [host] },
    "@/utils/graphql-endpoint": { buildTenantForwardHeaders: (host) => ({ "x-tenant-host": host }), resolveServerGraphqlUrl: (url) => url, resolveTenantHostForRequest: (host) => host },
    "./storefront-experience/server": { getVerifiedExperienceContext: async () => verified },
  });
  const query = {};
  await graphql.graphqlRequest(query, {});
  const key = JSON.parse(keys[0].slice("graphql:sf-v1:".length));
  assert.equal(key.scope, `https://${HOST}`);
  assert.deepEqual(key.experience, { base: "next-current", channel: 1, currency: "MXN", engine: "next", locale: "es", revision: 11 });
  assert.equal(clients[0].extraHeaders["x-tenant-host"], HOST); assert.equal(clients[0].extraHeaders["x-locale"], "es");
  verified = { ...verified, channel: { id: 2, code: "second" } }; await graphql.graphqlRequest(query, {});
  verified = { ...verified, locale: "en" }; await graphql.graphqlRequest(query, {});
  verified = { ...verified, published_revision_id: 12 }; await graphql.graphqlRequest(query, {});
  assert.equal(new Set(keys).size, 4);
  const beforePreview = keys.length;
  incoming.set("x-jectstore-next-preview-query", "fixture-only"); await graphql.graphqlRequest(query, {});
  assert.equal(keys.length, beforePreview, "Draft preview catalog never enters the public data cache");
  incoming.delete("x-jectstore-next-preview-query");
  process.env.STOREFRONT_EXPERIENCES_ENABLED = "false"; await graphql.graphqlRequest(query, {});
  assert.equal(JSON.parse(keys.at(-1).slice("graphql:sf-v1:".length)).experience, undefined, "Feature-off cache identity is unchanged");
});

test("actual product layouts pass authoritative currency unchanged on desktop and mobile", async () => {
  const products = [1, 2, 3].map((id) => ({ id: String(id), sku: `sku${id}`, name: `Product ${id}`, urlKey: `product-${id}`, price: "123.45", type: "simple" }));
  const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
  const carousel = loadSource("src/components/home/ProductCarousel.tsx", {
    "react/jsx-runtime": jsx, "../../lib/graphql-fetch": { graphqlRequestNoCache: async () => ({ products: { data: products } }) },
    "@/graphql/catelog/queries/Product": { GET_PRODUCTS: {} }, "./ThreeItemGrid": { ThreeItemGrid: "ThreeItemGrid" },
    "./ProductCarouselTheme": { __esModule: true, default: "ProductGrid" },
    "@/utils/server/storefront-currency": { getStorefrontCurrencyCode: async () => "COP" },
  }).default;
  for (const layout of ["three-item", "grid"]) {
    const tree = await carousel({ options: { title: "Products", description: "Copy", filters: {} }, currency: "MXN", layout });
    assert.equal(tree.props.currency, "MXN"); assert.equal(tree.props.products[0].price, "123.45");
  }
  assert.equal((await carousel({ options: { filters: {} } })).props.currency, "COP", "Legacy reads the channel instead of assuming USD");
  for (const desktop of [true, false]) {
    const grid = loadSource("src/components/home/ThreeItemGrid.tsx", {
      "react/jsx-runtime": jsx, "next/link": { __esModule: true, default: "Link" },
      "@/components/theme/ui/grid/Tile": { GridTileImage: "Tile" },
      "@utils/hooks/useMediaQueryHook": { useMediaQuery: () => desktop },
      "@/utils/constants": { getProductImageUrl: () => "/image.svg", NOT_IMAGE: "/fallback.svg" },
    }).ThreeItemGrid;
    const expand = (node) => {
      if (Array.isArray(node)) return node.map(expand);
      if (!node || typeof node !== "object") return node;
      if (typeof node.type === "function") return expand(node.type(node.props));
      return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
    };
    const tiles = nodes(expand(grid({ title: "Products", description: "Copy", products, currency: "MXN" })), "Tile");
    assert.equal(tiles.length, 3); assert.ok(tiles.every((tile) => tile.props.label.currencyCode === "MXN" && tile.props.label.amount === "123.45"));
  }
});

test("carousel preserves catalog salability through both actual product-card CTAs", async () => {
  const products = [true, false, null, undefined].map((isSaleable, index) => ({
    id: String(index + 1), sku: `sku${index}`, name: `Product ${index}`, urlKey: `product-${index}`,
    price: "123.45", type: "simple", isSaleable,
  }));
  const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
  const added = []; const warnings = [];
  const addToCart = loadSource("src/components/theme/ui/AddToCartButton.tsx", {
    "react/jsx-runtime": jsx,
    "@components/common/icons/ShoppingCartIcon": { __esModule: true, default: "CartIcon" },
    "@components/common/icons/LoadingDots": { __esModule: true, default: "LoadingDots" },
    "next/link": { __esModule: true, default: "Link" },
    "@utils/hooks/useAddToCart": { useAddProduct: () => ({ isCartLoading: false, onAddToCart: (value) => added.push(value) }) },
    "@/store/hooks": { useAppSelector: (selector) => selector({ user: { user: null } }) },
    "@utils/hooks/useToast": { useCustomToast: () => ({ showToast: (...args) => warnings.push(args) }) },
  }).default;
  const card = loadSource("src/components/catalog/product/ProductCard.tsx", {
    "react/jsx-runtime": jsx, "next/link": { __esModule: true, default: "Link" },
    "@/components/theme/ui/grid/Grid": { __esModule: true, default: { Item: "GridItem" } },
    "@/components/theme/ui/AddToCartButton": { __esModule: true, default: addToCart },
    "@/components/common/NextImage": { NextImage: "Image" }, "@/components/theme/ui/Price": { Price: "Price" },
  }).ProductCard;
  const theme = loadSource("src/components/home/ProductCarouselTheme.tsx", {
    "react/jsx-runtime": jsx, "@components/catalog/product/ProductCard": { ProductCard: card },
    "@utils/constants": { getProductImageUrl: () => "/image.svg" },
  }).default;
  const carousel = loadSource("src/components/home/ProductCarousel.tsx", {
    "react/jsx-runtime": jsx, "../../lib/graphql-fetch": { graphqlRequestNoCache: async () => ({ products: { data: products } }) },
    "@/graphql/catelog/queries/Product": { GET_PRODUCTS: {} }, "./ThreeItemGrid": { ThreeItemGrid: "ThreeItemGrid" },
    "./ProductCarouselTheme": { __esModule: true, default: theme },
    "@/utils/server/storefront-currency": { getStorefrontCurrencyCode: async () => "COP" },
  }).default;
  const expand = (node) => {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
  };
  const rendered = await carousel({ options: { title: "Products", filters: {} }, layout: "grid", currency: "COP" });
  assert.deepEqual(rendered.props.products.map((product) => product.isSaleable), [true, false, null, undefined]);
  const buttons = nodes(expand(rendered), "button");
  assert.equal(buttons.length, 8, "Desktop and mobile both retain their existing CTA");
  for (const [index, product] of products.entries()) {
    for (const button of buttons.slice(index * 2, index * 2 + 2)) {
      assert.equal(button.props["aria-disabled"], product.isSaleable !== true);
      button.props.onClick();
    }
  }
  assert.deepEqual(added, [{ productId: "1", quantity: 1, token: undefined }, { productId: "1", quantity: 1, token: undefined }]);
  assert.equal(warnings.length, 6, "Unavailable or unknown catalog state never dispatches an add-to-cart action");
});

function frameClock() {
  const pending = new Map(); let id = 0;
  return {
    requestAnimationFrame(callback) { pending.set(++id, callback); return id; },
    cancelAnimationFrame(id) { pending.delete(id); },
    flush() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(0)); },
    get pending() { return pending.size; },
  };
}

test("preview bridge is nonce/source-scoped, blocks mutations only inside the iframe and cleans up", () => {
  const { installNextPreviewBridge } = loadSource("src/lib/storefront-experience/preview-bridge.ts");
  const listeners = new Map(); const notifications = [];
  const frames = frameClock();
  const section = { dataset: { storefrontSectionId: "products-1" }, closest() { return this; } };
  const rootNode = { contains: (node) => node === section };
  const fakeDocument = { getElementById: () => rootNode, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  const target = { ...frames, document: fakeDocument, location: { href: "https://a.jectstore.test/__storefront-next-preview?_editor_preview=nonce", search: "?_editor_preview=nonce" }, parent: { postMessage: (...args) => notifications.push(args) }, addEventListener() {}, removeEventListener() {} };
  const dispose = installNextPreviewBridge(target, ["products-1"]);
  assert.equal(notifications[0][1], "https://a.jectstore.test");
  assert.equal(notifications[0][0].previewToken, "nonce");
  const stopped = [];
  listeners.get("click")({ target: { closest: () => section }, preventDefault: () => stopped.push("default"), stopPropagation() {}, stopImmediatePropagation() {} });
  frames.flush();
  assert.equal(notifications[1][0].sectionId, "products-1"); assert.equal(stopped.length, 1);
  section.dataset.storefrontSectionId = "unknown";
  listeners.get("click")({ target: { closest: () => section }, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
  assert.equal(notifications.length, 2);
  dispose(); assert.equal(listeners.size, 0);
  target.parent = target; installNextPreviewBridge(target, ["products-1"]); assert.equal(listeners.size, 0);
});

test("native preview inspection accepts only its exact parent and nonce and never interprets HTML effects", () => {
  const { installNextPreviewBridge } = loadSource("src/lib/storefront-experience/preview-bridge.ts");
  const events = new Map(); const notifications = []; const rect = { left: 10, top: 20, right: 200, bottom: 100, width: 190, height: 80 };
  const frames = frameClock(); let measured = 0;
  const section = { dataset: { storefrontSectionId: "products-1" }, closest() { return this; }, getBoundingClientRect: () => { measured++; return { width: 0, height: 0 }; }, children: [{ getBoundingClientRect: () => rect }] };
  const rootNode = { contains: node => node === section, querySelectorAll: () => [section] };
  const fakeDocument = { getElementById: () => rootNode, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) };
  const target = { ...frames, document: fakeDocument, location: { href: "https://a.jectstore.test/__storefront-next-preview?_editor_preview=nonce", search: "?_editor_preview=nonce" }, parent: { postMessage: (...args) => notifications.push(args) }, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) };
  const dispose = installNextPreviewBridge(target, ["products-1"]);
  const send = (changes = {}) => events.get('message')({ source: target.parent, origin: 'https://a.jectstore.test', data: { type: 'jectstore:next-inspector', action: 'craftile.editor.select-block', blockId: 'products-1', previewToken: 'nonce' }, ...changes });
  send({ source: {} }); send({ origin: 'null' }); send({ origin: 'https://foreign.test' }); send({ data: { type: 'jectstore:next-inspector', action: 'craftile.editor.select-block', blockId: 'products-1', previewToken: 'wrong' } });
  assert.equal(notifications.length, 1);
  send(); frames.flush(); assert.equal(notifications[1][0].type, 'jectstore:storefront-section-position');
  assert.deepEqual(JSON.parse(JSON.stringify(notifications[1][0].rect)), { x: 10, y: 20, ...rect });
  send({ data: { type: 'jectstore:next-inspector', action: 'updates.effects', html: '<script>untrusted</script>', previewToken: 'nonce' } });
  assert.equal(notifications.length, 2);
  const before = measured;
  for (let i = 0; i < 50; i++) { events.get('scroll')(); events.get('resize')(); events.get('pointerover')({ target: { closest: () => section } }); }
  assert.equal(notifications.length, 2); assert.equal(frames.pending, 1);
  frames.flush(); assert.equal(notifications.length, 4); assert.equal(measured, before + 1, 'One layout read per section per frame');
  events.get('pointerover')({ target: { closest: () => section } });
  assert.equal(frames.pending, 0, 'Repeated descendants in the same section do not emit or measure');
  events.get('scroll')(); assert.equal(frames.pending, 1);
  dispose(); assert.equal(events.size, 0); assert.equal(frames.pending, 0);
  frames.flush(); assert.equal(notifications.length, 4);
});
