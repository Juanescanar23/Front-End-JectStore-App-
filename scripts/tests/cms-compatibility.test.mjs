import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import test from "node:test";

const root = process.env.HOMESTORE_NEXT_SOURCE ? path.resolve(process.env.HOMESTORE_NEXT_SOURCE)
  : [path.resolve(import.meta.dirname, "../.."), path.resolve(import.meta.dirname, "..")]
    .find((candidate) => existsSync(path.join(candidate, "package.json")) && existsSync(path.join(candidate, "src")));
assert.ok(root, "Set HOMESTORE_NEXT_SOURCE or run this test from the repository");
const requireDependency = createRequire(path.join(root, "package.json"));
const ts = requireDependency("typescript");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const jsx = (type, props) => ({ type, props: props || {} });
const interop = (value) => ({ default: value, __esModule: true });
function load(file, dependencies = {}) {
  const output = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    if (name === "@/utils/cms-links") return load("src/utils/cms-links.ts");
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected import ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((item) => nodes(item, type));
  if (!tree || typeof tree !== "object") return [];
  if (typeof tree.type === "function") return nodes(tree.type(tree.props), type);
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props.children, type)];
}
async function footer(urls, editorial = false) {
  const Footer = load("src/components/layout/footer/FooterMenu.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/components/common/StorefrontLink": interop("Link"),
    "@/utils/type-guards": { isArray: Array.isArray },
    "@/utils/helper": { safeParse: JSON.parse },
    "@/utils/theme-translation": { pickTranslationByLocale: (translations, locale) => translations.find((item) => item.localeCode === locale) },
    "@/utils/server/storefront-locale": { getStorefrontLocaleCode: async () => "es" },
  }).default;
  const columns = { column_1: urls.map((url, index) => ({ title: `Item ${index}`, url })), column_2: [], column_3: [] };
  const tree = await Footer({ menu: [{ translations: [{ localeCode: "es", options: columns }] }], editorial: editorial ? columns : undefined });
  return nodes(tree, "Link");
}

test("legacy footer keeps external, deep locale path, query and fragment without final-segment stripping", async () => {
  const urls = ["https://docs.example.test/es/ayuda?from=footer#contacto", "/es/page/privacy-policy?locale=es&tag=one&tag=two#datos", "/page/about-us?locale=es", "/privacy-policy"];
  assert.deepEqual((await footer(urls)).map((node) => node.props.href), urls);
});

test("editorial footer preserves approved paths and its exact incumbent classes", async () => {
  const urls = ["/page/privacy-policy?locale=es", "/es/ayuda/contacto#correo"];
  const links = await footer(urls, true);
  assert.deepEqual(links.map((node) => node.props.href), urls);
  assert.ok(links.every((node) => node.props.className.includes("break-words whitespace-normal")));
  const after = readFileSync(path.join(root, "src/components/layout/footer/FooterMenu.tsx"), "utf8");
  function classes(source) {
    const ast = ts.createSourceFile("Footer.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const values = [];
    function visit(node) {
      if (ts.isJsxAttribute(node) && node.name.getText(ast) === "className") values.push(node.initializer.getText(ast));
      ts.forEachChild(node, visit);
    }
    visit(ast);
    return values;
  }
  assert.equal(sha(JSON.stringify(classes(after))), "bc9680589b4936c7663a34e35641607dfdf0c98b631dbb4bf75f010103cfc030");
});

test("safe footer destinations preserve full HTTP(S), mail, telephone, query and unicode path", () => {
  const { resolveFooterHref } = load("src/utils/cms-links.ts");
  for (const url of ["https://example.test/a/b?locale=es&x=1#mail", "http://example.test/a?x=1", "mailto:soporte@example.test?subject=Ayuda", "tel:+12025550123", "/es/m%C3%A1s?locale=es", "/es/más?locale=es", "?locale=es&tab=datos", "#privacidad", "/docs/v1:2?key=a%2Fb"]) {
    assert.equal(resolveFooterHref(url), url);
  }
  assert.equal(resolveFooterHref("ayuda/envios?locale=es#tiempos"), "/ayuda/envios?locale=es#tiempos");
});

test("unsafe footer href cannot become script, encoded network-path, control injection or credentials", () => {
  const { resolveFooterHref } = load("src/utils/cms-links.ts");
  for (const url of ["javascript:alert(1)", " JAVASCRIPT:alert(1)", "data:text/html,test", "vbscript:run()", "file:///tmp/private", "//outside.test/path", "/%2foutside.test/path", "/%252foutside.test/path", "/\\outside.test", "/x%0d%0aSet-Cookie:test", "/x%250aheader", "https://user:password@example.test/path", "https://example.test/\\outside", "mailto:user@example.test%0aBcc:third@example.test", "../admin", "foo/../../admin", "/x/../admin", "java%73cript:alert(1)", "https://", "mailto:", "tel:"]) {
    assert.equal(resolveFooterHref(url), "/", url);
  }
  for (const url of [null, undefined, "", 42, {}, []]) assert.equal(resolveFooterHref(url), "/");
});

test("footer component applies the same non-executable href policy to legacy and editorial", async () => {
  for (const editorial of [false, true]) {
    const links = await footer(["javascript:alert(1)", "/page/privacy-policy?locale=es"], editorial);
    assert.deepEqual(links.map((node) => node.props.href), ["/", "/page/privacy-policy?locale=es"]);
  }
});

test("CMS alias serializes repeated query keys and preserves locale and encoded values", () => {
  const { cmsPageAliasHref } = load("src/utils/cms-links.ts");
  const target = cmsPageAliasHref("privacy-policy", { locale: "es-MX", tag: ["one", "two"], q: "a/b + c & d", absent: undefined });
  assert.equal(target, "/privacy-policy?locale=es-MX&tag=one&tag=two&q=a%2Fb+%2B+c+%26+d");
  const url = new URL(target, "https://tenant.example.test");
  assert.equal(url.origin, "https://tenant.example.test");
  assert.deepEqual(url.searchParams.getAll("tag"), ["one", "two"]);
  assert.equal(url.searchParams.get("locale"), "es-MX");
  assert.equal(url.searchParams.get("q"), "a/b + c & d");
});

test("alias slug matches the exact existing backend ASCII boundary and never permits redirect origins", () => {
  const { cmsPageAliasHref } = load("src/utils/cms-links.ts");
  for (const slug of ["a", "About-us", "terms-2026", "a".repeat(255)]) assert.equal(cmsPageAliasHref(slug, {}), `/${slug}`);
  for (const slug of ["", "a".repeat(256), "-terms", "terms-", "a--b", "../admin", "//outside.test", "https:outside", "%2fadmin", "terms/other", "términos", "a\n", null, 1]) assert.equal(cmsPageAliasHref(slug, {}), null);
});

test("alias keeps query text as query data, never an open redirect or injected header", () => {
  const { cmsPageAliasHref } = load("src/utils/cms-links.ts");
  const href = cmsPageAliasHref("about-us", { next: "https://outside.test/private", return: "//outside.test", q: "\r\nLocation: https://outside.test" });
  assert.equal(new URL(href, "https://tenant.example.test").pathname, "/about-us");
  assert.ok(href.startsWith("/about-us?"));
  assert.ok(!href.includes("\r") && !href.includes("\n"));
});

test("actual alias route redirects through the canonical route without duplicating content or querying", async () => {
  const redirects = [], missing = [];
  const Alias = load("src/app/(public)/page/[slug]/page.tsx", {
    "next/navigation": { redirect: (href) => { redirects.push(href); return { redirect: href }; }, notFound: () => { missing.push(true); throw new Error("not-found"); } },
  }).default;
  const params = Promise.resolve({ slug: "about-us" });
  const searchParams = Promise.resolve({ locale: "es", tag: ["one", "two"] });
  await Alias({ params, searchParams });
  assert.deepEqual(redirects, ["/about-us?locale=es&tag=one&tag=two"]);
  await assert.rejects(() => Alias({ params: Promise.resolve({ slug: "../admin" }), searchParams: Promise.resolve({}) }), /not-found/);
  assert.equal(missing.length, 1);
  assert.equal(redirects.length, 1);
});

test("signed CMS query remains byte-exact baseline; no policy content or contact route added", () => {
  assert.equal(sha(readFileSync(path.join(root, "src/graphql/theme/queries/PageByUrlKey.ts"))), "ab715ce5ce3734c2e76c71dde8c2cd1845daa1d611a15a2cf3ec02360d2c0426");
  const source = ts.createSourceFile("index.ts", readFileSync(path.join(root, "src/utils/bagisto/index.ts"), "utf8"), ts.ScriptTarget.Latest, true);
  const getPage = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "getPage");
  assert.ok(getPage);
  assert.equal(sha(getPage.getText(source)), "bd115b7cbd234970e46e5d10c550bd4c3010cd88dee54940bf2e92acf758bc93");
});

test("canonical CMS displays configured Spanish date copy and uses the semantic API calendar date", async () => {
  const Page = load("src/app/(public)/[page]/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/navigation": { notFound: () => { throw new Error("not-found"); } },
    "@components/theme/search/Prose": interop("Prose"),
    "@utils/bagisto": { getPage: async () => [{ updatedAt: "2026-11-05T00:00:00Z", translation: { pageTitle: "Ejemplo", htmlContent: "<p>Ejemplo</p>" } }] },
    "@/utils/server/storefront-locale": { getStorefrontLocaleCode: async () => "es" },
    "@/utils/cms-updated-at": load("src/utils/cms-updated-at.ts"),
  }).default;
  const tree = await Page({ params: Promise.resolve({ page: "about-us" }) });
  const time = nodes(tree, "time");
  assert.equal(time.length, 1);
  assert.equal(time[0].props.dateTime, "2026-11-05");
  assert.match(time[0].props.children, /5 de noviembre de 2026/);
  assert.ok(JSON.stringify(tree).includes("Última actualización"));
  assert.ok(!JSON.stringify(tree).includes("This document"));
});

test("CMS date handles missing or impossible metadata without inventing a date or throwing", () => {
  const { cmsUpdatedAt } = load("src/utils/cms-updated-at.ts");
  for (const value of [null, undefined, "", "---", 42, "not-a-date", "2026-13-01", "2026-02-30", "2026-11-05T25:00:00Z", "2026-11-05junk"]) assert.equal(cmsUpdatedAt(value, "es"), null, String(value));
  const valid = cmsUpdatedAt("2026-11-05 00:00:00", "es-MX");
  assert.equal(valid.dateTime, "2026-11-05");
  assert.equal(valid.label, "Última actualización");
  assert.match(valid.dateLabel, /5 de noviembre de 2026/);
  assert.equal(cmsUpdatedAt("2026-11-05T00:00:00Z", "en_US").label, "Last updated");
  assert.equal(cmsUpdatedAt("2026-11-05T00:00:00Z", "invalid locale!").label, "Última actualización");
  assert.equal(cmsUpdatedAt("2026-11-04T19:00:00-05:00", "es").dateTime, "2026-11-04");
});
