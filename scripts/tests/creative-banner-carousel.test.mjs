import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { nextDocument } from "./fixtures/storefront-experience.mjs";

const root = path.resolve(process.env.HOMESTORE_NEXT_SOURCE || path.resolve(import.meta.dirname, "../.."));
const require = createRequire(path.resolve(process.env.HOMESTORE_NEXT_DEPENDENCIES || root, "package.json"));
const React = require("react"), jsx = require("react/jsx-runtime"), { renderToStaticMarkup } = require("react-dom/server"), ts = require("typescript");
function load(file, mocks = {}) {
  const loaded = { exports: {} };
  const output = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", output)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const compositionApi = load("src/lib/storefront-experience/banner-composition.ts");
const documentApi = load("src/lib/storefront-experience/document.ts", { "./banner-composition": compositionApi });
const composition = (overrides = {}) => ({ schema_version: 1, mold: "product_focus", theme: "light", font_id: "brand", eyebrow: "Colección local", heading: "Objetos para cada día", body: "Contenido sintético para revisar el diseño local.", cta_label: "Ver colección", ...overrides });
const slides = () => ["product_focus", "collection", "seasonal_offer"].map((mold, index) => ({
  image: `/storage/synthetic-${index}.webp`, imageUrl: `/storage/alias-${index}.webp`, title: `Fotografía sintética ${index + 1}`, link: `/search/coleccion-${index + 1}`, composition: composition({ mold }),
}));
const creativeDocument = () => {
  const document = nextDocument();
  document.sections[0] = { id: "creative-local", type: "creative_banner_carousel", visible: true, settings: { images: slides() } };
  return document;
};

test("all closed mold, contrast and platform-font combinations retain complete text verbatim", () => {
  for (const mold of ["product_focus", "collection", "seasonal_offer"]) for (const theme of ["light", "dark"]) for (const font_id of ["brand", "system_sans", "system_serif"]) {
    const value = composition({ mold, theme, font_id, body: "  60% de descuento\r\nColección café 🛍️\n  " });
    assert.deepEqual(compositionApi.parseBannerComposition(value), value);
  }
  const doc = creativeDocument(), before = structuredClone(doc);
  assert.deepEqual(documentApi.parseNextStorefrontDocument(doc), before);
  assert.deepEqual(doc, before);
  doc.sections[0].settings.images = [];
  assert.deepEqual(documentApi.parseNextStorefrontDocument(doc), doc, "An empty draft can be saved without invented slides");
});

test("composition has no hydration defaults, unknown keys, executable content or partial objects", () => {
  for (const field of Object.keys(composition())) {
    const incomplete = composition(); delete incomplete[field];
    assert.throws(() => compositionApi.parseBannerComposition(incomplete), field);
  }
  for (const override of [{ schema_version: "1" }, { mold: "custom" }, { theme: "red" }, { font_id: "uploaded-font" }, { style: "color:red" }, { heading: "\u200b \u00a0" }, { heading: "\ud800" }]) {
    assert.throws(() => compositionApi.parseBannerComposition(composition(override)));
  }
  for (const heading of ["<script>", "&#x3c;script&#x3e;", "&lt;script&gt;", "&nvlt;script&nvgt;", "%253Cscript%253E", "%25253Cscript%25253E", "&amp;lt;script&amp;gt;", "&lbrace;color:red&semi;&rbrace;", "javascript&colon;bad", "style = bad", "@php", "window . location", "fetch (x)", "color:red;", "%FF", "%C3", "%00", "\u007f"]) {
    assert.throws(() => compositionApi.parseBannerComposition(composition({ heading })), heading);
  }
  for (const heading of ["60% de descuento", "Café, colección y acción", "%C3%A9", "Oferta % sin cifra", "100%", "Primera línea\r\nSegunda línea", "🛍️".repeat(32), "éjavascript:bad", "&#x7f;", "&#1;", "&#13;"]) {
    assert.equal(compositionApi.parseBannerComposition(composition({ heading })).heading, heading);
  }
  for (const [field, max] of Object.entries({ eyebrow: 40, heading: 64, body: 160, cta_label: 32 })) {
    assert.equal(compositionApi.parseBannerComposition(composition({ [field]: "🎁".repeat(max) }))[field], "🎁".repeat(max));
    assert.throws(() => compositionApi.parseBannerComposition(composition({ [field]: "🎁".repeat(max + 1) })), field);
  }
});

test("legacy remains an unmodified separate contract; creative links cannot become foreign or executable", () => {
  const old = nextDocument(), original = JSON.stringify(old);
  assert.deepEqual(documentApi.parseNextStorefrontDocument(old), old);
  assert.equal(JSON.stringify(old), original);
  old.sections[0].settings.images[0].composition = composition();
  assert.throws(() => documentApi.parseNextStorefrontDocument(old), /image/);
  for (const link of ["https://other.test", "//other.test", "category-slug", "/%2fother.test", "/%252fother.test", "/foo%0abar", "/foo%3cscript%3e", "/\\other.test"]) {
    const doc = creativeDocument(); doc.sections[0].settings.images[0].link = link;
    assert.throws(() => documentApi.parseNextStorefrontDocument(doc), link);
    assert.equal(documentApi.creativeBannerHref(link), "");
  }
  for (const path of ["https://other.test/x.webp", "/other/x.webp", "/storage/a/../x.webp", "/storage/a/./x.webp", "/storage/a%20b.webp", "/storage/niño.webp", "/storage/a.webp?x=1", "/storage/a.webp#x", "storage/a.webp"]) {
    const doc = creativeDocument(); doc.sections[0].settings.images[0].image = path;
    assert.throws(() => documentApi.parseNextStorefrontDocument(doc), path);
  }
  const deletedAsset = creativeDocument(); deletedAsset.sections[0].settings.images[0].image = "/storage/no-longer-present.webp";
  assert.deepEqual(documentApi.parseNextStorefrontDocument(deletedAsset), deletedAsset, "Public parsing is path-only, never a disk lookup");
});

const ImageFixture = ({ src, alt, className }) => React.createElement("img", { src, alt, className });
const IconFixture = props => React.createElement("svg", props);
const css = new Proxy({}, { get: (_target, name) => name });
const dependencies = react => ({ react, "react/jsx-runtime": jsx, "@/components/common/StorefrontLink": { __esModule: true, default: "a" },
  "next/image": { __esModule: true, default: ImageFixture }, "@heroicons/react/24/outline": { ArrowLeftIcon: IconFixture, ArrowRightIcon: IconFixture },
  "@/lib/storefront-experience/document": documentApi, "./CreativeBannerCarousel.module.css": { __esModule: true, default: css } });
const walk = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)];
function harness(initial = slides()) {
  let values = initial, cursor = 0, dirty = false, tree;
  const state = [], focused = [];
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], next => { state[index] = typeof next === "function" ? next(state[index]) : next; dirty = true; }]; },
    useRef(initial) { const index = cursor++; return state[index] ??= { current: initial }; },
  };
  const Component = load("src/components/home/CreativeBannerCarousel.tsx", dependencies(hooks)).default;
  function flush() {
    let attempts = 0;
    do { assert.ok(attempts++ < 10); cursor = 0; dirty = false; tree = Component({ options: { images: values } });
      for (const node of walk(tree)) if (typeof node.props?.ref === "function") node.props.ref({ focus: () => focused.push(node.props["aria-label"]) });
    } while (dirty);
  }
  flush();
  return { tree: () => tree, focused, active: () => walk(tree).find(node => node.props?.["data-active"] === true),
    invoke(node, handler, event = {}) { node.props[handler](event); flush(); },
    update(next) { values = next; flush(); }, find: predicate => walk(tree).filter(predicate) };
}

test("SSR renders separate merchant text, image alt, closed font IDs and only valid active calls to action", () => {
  const Component = load("src/components/home/CreativeBannerCarousel.tsx", dependencies(React)).default;
  const values = slides(); values[0].composition.heading = "Tú & tu colección"; values[0].composition.body = "Un texto <literal> sin HTML";
  const html = renderToStaticMarkup(React.createElement(Component, { options: { images: values } }));
  assert.match(html, /<h2[^>]*>Tú &amp; tu colección<\/h2>/);
  assert.match(html, /Un texto &lt;literal&gt; sin HTML/);
  assert.match(html, /alt="Fotografía sintética 1"/);
  assert.match(html, /src="\/storage\/synthetic-0.webp"/, "Image takes precedence over its alias");
  for (const mold of ["product_focus", "collection", "seasonal_offer"]) assert.match(html, new RegExp(`data-mold="${mold}"`));
  assert.equal((html.match(/inert=""/g) || []).length, 2);
  assert.doesNotMatch(html, /style=|fonts\.(googleapis|bunny)|<script/);
  values[0].link = "https://other.test"; values[1].composition.cta_label = ""; values[2].link = "";
  const noLinks = renderToStaticMarkup(React.createElement(Component, { options: { images: values } }));
  assert.doesNotMatch(noLinks, /<a\b/);
});

test("manual navigation wraps, moves keyboard focus off inert slides and tolerates an emptied draft", () => {
  const h = harness(), key = value => ({ key: value, target: { closest: () => null }, preventDefault() { this.prevented = true; } });
  assert.equal(h.active().props["data-mold"], "product_focus");
  h.invoke(h.find(node => node.props?.["aria-label"] === "Portada siguiente")[0], "onClick");
  assert.equal(h.active().props["data-mold"], "collection");
  for (const [value, mold] of [["End", "seasonal_offer"], ["ArrowRight", "product_focus"], ["ArrowLeft", "seasonal_offer"], ["Home", "product_focus"]]) {
    const event = key(value); h.invoke(h.tree(), "onKeyDown", event);
    assert.equal(event.prevented, true); assert.equal(h.active().props["data-mold"], mold);
  }
  assert.equal(h.focused.at(-1), "Mostrar portada 1 de 3");
  assert(h.find(node => node.type === "button").every(node => node.props.type === "button"));
  const failedImage = h.find(node => node.type === ImageFixture)[0]; h.invoke(failedImage, "onError");
  assert.equal(h.find(node => node.props?.role === "img")[0].props["aria-label"], "Fotografía sintética 1: imagen no disponible");
  h.update([slides()[0]]); assert.equal(h.find(node => node.type === "nav").length, 0);
  h.update([]); assert.equal(h.tree(), null);
});

test("scoped CSS supplies three layouts, platform-only fonts, 44px controls, reduced motion and measured contrast", () => {
  const stylesheet = readFileSync(path.join(root, "src/components/home/CreativeBannerCarousel.module.css"), "utf8");
  assert.match(stylesheet, /min-width: 44px; min-height: 44px/);
  assert.match(stylesheet, /prefers-reduced-motion: reduce/);
  assert.match(stylesheet, /\[data-mold="product_focus"\].*grid-template-columns/);
  assert.match(stylesheet, /\[data-mold="collection"\].*grid-template-columns/);
  assert.match(stylesheet, /\[data-mold="seasonal_offer"\].*grid-template-columns/);
  assert.doesNotMatch(stylesheet, /@import|@font-face|url\(|:root|(?:^|})\s*(?:html|body)\s*\{/m);
  const luminance = hex => { const parts = hex.match(/[a-f0-9]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return parts[0] * .2126 + parts[1] * .7152 + parts[2] * .0722; };
  for (const [ink, background] of [["171717", "f5f5f5"], ["404040", "f5f5f5"], ["ffffff", "171717"], ["d4d4d4", "171717"]]) {
    const values = [luminance(ink), luminance(background)].sort((a, b) => b - a);
    assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5, `${ink} on ${background}`);
  }
});

class PreviewElement {
  constructor(tag, attributes = {}, parent = null, namespace = 'http://www.w3.org/1999/xhtml') {
    this.tagName = tag.toUpperCase(); this.attributes = attributes; this.parent = parent; this.namespaceURI = namespace;
    this.dataset = { storefrontSectionId: attributes['data-storefront-section-id'] };
    this.children = []; this.disabled = false; this.form = null;
    parent?.children.push(this);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  contains(element) { for (let node = element; node; node = node.parent) if (node === this) return true; return false; }
  closest(selector) {
    for (let node = this; node; node = node.parent) {
      if (selector === '[data-storefront-section-id]' && node.getAttribute('data-storefront-section-id')) return node;
      if (selector === 'button[type="button"]' && node.tagName === 'BUTTON' && node.getAttribute('type') === 'button') return node;
      if (selector === 'nav[data-next-preview-local-controls="creative-covers"]' && node.tagName === 'NAV'
        && node.getAttribute('data-next-preview-local-controls') === 'creative-covers') return node;
      if (selector.split(',').includes(node.tagName.toLowerCase())) return node;
    }
    return null;
  }
  getBoundingClientRect() { return { left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }; }
}

function previewFixture() {
  const { installNextPreviewBridge } = load('src/lib/storefront-experience/preview-bridge.ts');
  const events = new Map(), notifications = [], frames = new Map(); let nextFrame = 0;
  const rootElement = new PreviewElement('div');
  const section = new PreviewElement('div', { 'data-storefront-section-id': 'creative-local' }, rootElement);
  const nav = new PreviewElement('nav', { 'data-next-preview-local-controls': 'creative-covers' }, section);
  const button = new PreviewElement('button', { type: 'button' }, nav);
  const icon = new PreviewElement('path', {}, new PreviewElement('svg', {}, button, 'http://www.w3.org/2000/svg'), 'http://www.w3.org/2000/svg');
  const document = { getElementById: () => rootElement, addEventListener: (name, handler) => events.set(name, handler), removeEventListener: name => events.delete(name) };
  const target = { document, location: { href: 'https://a.jectstore.test/__storefront-next-preview?_editor_preview=nonce', search: '?_editor_preview=nonce' },
    parent: { postMessage: payload => notifications.push(payload) }, addEventListener: (name, handler) => events.set(name, handler), removeEventListener: name => events.delete(name),
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; }, cancelAnimationFrame(id) { frames.delete(id); } };
  const dispose = installNextPreviewBridge(target, ['creative-local']);
  const inspector = (action, changes = {}) => events.get('message')({ source: target.parent, origin: 'https://a.jectstore.test',
    data: { type: 'jectstore:next-inspector', action, previewToken: 'nonce' }, ...changes });
  const dispatch = (node, handler = () => {}, type = 'click') => {
    const stopped = [];
    events.get(type)({ target: node, preventDefault() { stopped.push('default'); }, stopPropagation() { stopped.push('propagation'); }, stopImmediatePropagation() { stopped.push('immediate'); } });
    if (!stopped.length) handler();
    return stopped;
  };
  return { rootElement, section, nav, button, icon, events, notifications, dispose, dispatch,
    disable: () => inspector('craftile.inspector.disable'), enable: () => inspector('craftile.inspector.enable'), inspector,
    flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); } };
}

test('inspection OFF lets only marked authored carousel clicks reach the actual local React handlers', () => {
  const h = harness(), preview = previewFixture();
  assert.equal(h.find(node => node.type === 'nav')[0].props['data-next-preview-local-controls'], 'creative-covers');
  preview.disable(); preview.flush();
  for (const [label, expected] of [['Portada siguiente', 'collection'], ['Portada anterior', 'product_focus'], ['Mostrar portada 3 de 3', 'seasonal_offer']]) {
    const eventStops = preview.dispatch(preview.icon, () => h.invoke(h.find(node => node.props?.['aria-label'] === label)[0], 'onClick'));
    assert.deepEqual(eventStops, [], label);
    assert.equal(h.active().props['data-mold'], expected, label);
  }
  assert.equal(preview.notifications.filter(value => value.type === 'jectstore:storefront-section-selected').length, 0);
  preview.enable();
  assert.deepEqual(preview.dispatch(preview.button, () => assert.fail('Inspection may select only, never change a slide')), ['default', 'propagation', 'immediate']);
  preview.flush();
  assert.equal(preview.notifications.at(-1).type, 'jectstore:storefront-section-selected');
  assert.equal(preview.notifications.at(-1).sectionId, 'creative-local');
  assert.equal(h.active().props['data-mold'], 'seasonal_offer');
  preview.dispose(); assert.equal(preview.events.size, 0);
});

test('inspection OFF never grants links, forms, generic buttons, forged markers or off-root sections an interaction exception', () => {
  const preview = previewFixture(); preview.disable();
  const marker = { 'data-next-preview-local-controls': 'creative-covers' };
  const generic = new PreviewElement('button', { type: 'button' }, preview.section);
  const wrongMarker = new PreviewElement('nav', { 'data-next-preview-local-controls': 'other' }, preview.section);
  const wrongTag = new PreviewElement('div', marker, preview.section);
  const foreignNav = new PreviewElement('nav', marker, preview.section, 'http://www.w3.org/2000/svg');
  const unknown = new PreviewElement('div', { 'data-storefront-section-id': 'unknown' }, preview.rootElement);
  const outside = new PreviewElement('div', { 'data-storefront-section-id': 'creative-local' });
  const wrappedLink = new PreviewElement('a', { href: '/checkout' }, preview.button);
  const inForm = new PreviewElement('button', { type: 'button' }, new PreviewElement('form', { action: '/newsletter' }, preview.nav));
  const linkedAncestor = new PreviewElement('button', { type: 'button' }, new PreviewElement('a', { href: '/cart' }, preview.nav));
  const associatedForm = new PreviewElement('button', { type: 'button' }, preview.nav); associatedForm.form = new PreviewElement('form');
  const disabled = new PreviewElement('button', { type: 'button' }, preview.nav); disabled.disabled = true;
  const blocked = [generic, new PreviewElement('a', { href: '/search' }, preview.nav), wrappedLink, new PreviewElement('span', {}, wrappedLink),
    new PreviewElement('button', { type: 'submit' }, preview.nav), new PreviewElement('button', {}, preview.nav), new PreviewElement('div', { type: 'button', role: 'button' }, preview.nav),
    new PreviewElement('button', { type: 'button' }, wrongMarker), new PreviewElement('button', { type: 'button' }, wrongTag),
    new PreviewElement('button', { type: 'button' }, foreignNav), new PreviewElement('button', { type: 'button' }, preview.nav, 'http://www.w3.org/2000/svg'),
    new PreviewElement('button', { type: 'button' }, new PreviewElement('nav', marker, unknown)),
    new PreviewElement('button', { type: 'button' }, new PreviewElement('nav', marker, outside)),
    new PreviewElement('button', { type: 'button' }, new PreviewElement('nav', marker, preview.rootElement)),
    new PreviewElement('input', { type: 'button' }, preview.button), new PreviewElement('label', { for: 'checkout' }, preview.button), inForm, linkedAncestor, associatedForm, disabled];
  for (const node of blocked) assert.deepEqual(preview.dispatch(node, () => assert.fail('No generic control/network exception')), ['default', 'propagation', 'immediate'], node.tagName);
  for (const node of [preview.button, inForm, associatedForm]) assert.deepEqual(preview.dispatch(node, () => assert.fail('All submits remain blocked'), 'submit'), ['default', 'propagation', 'immediate']);
  preview.dispose();
});

test('forged parent messages cannot turn inspection off to activate carousel buttons', () => {
  const preview = previewFixture();
  for (const changes of [{ source: {} }, { origin: 'null' }, { origin: 'https://other.test' }, { data: { type: 'jectstore:next-inspector', action: 'craftile.inspector.disable', previewToken: 'wrong' } }]) {
    preview.inspector('craftile.inspector.disable', changes);
    assert.deepEqual(preview.dispatch(preview.button, () => assert.fail('Inspection was not authentically disabled')), ['default', 'propagation', 'immediate']);
  }
  preview.dispose();
});
