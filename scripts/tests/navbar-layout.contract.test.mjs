import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const file = "src/components/layout/navbar/index.tsx";
const baselineReference = "c75040675bbfc15d6fbb3849eeac3c48e59ad635";
const historicalSources = JSON.parse(readFileSync(new URL("./fixtures/frontend-baselines.json", import.meta.url), "utf8")).snapshots;
const baselineSource = () => {
  const snapshot = historicalSources.find((entry) => entry.reference === baselineReference && entry.path === file);
  assert.ok(snapshot, "Missing immutable navbar baseline");
  assert.equal(createHash("sha256").update(snapshot.source).digest("hex"), snapshot.sha256, "Navbar baseline hash mismatch");
  return snapshot.source;
};
const nodes = (tree, predicate) => {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const tokens = (node) => new Set((node.props.className || "").split(/\s+/));
const names = [
  "Colección de accesorios personalizados para todas las celebraciones ".repeat(3),
  "CategoríaSinEspacios".repeat(10),
  "衣類とアクセサリー — إكسسوارات ومجموعات — México 🎁".repeat(4),
];
const categories = [
  { id: "1", name: "Root excluded", slug: "root" },
  { id: "empty", name: "", slug: "empty" },
  ...names.map((name, index) => ({ id: String(index + 2), name, slug: `fixture-${index}` })),
  { id: "extra", name: "Outside existing three-category cap", slug: "extra" },
];

async function renderNavbar({ baseline = false, data = categories, allowsCheckout = true, branding = null, editorial } = {}) {
  const source = baseline
    ? baselineSource()
    : readFileSync(path.join(root, file), "utf8");
  const element = (type, props) => ({ type, props: props || {} });
  const calls = [];
  const dependencies = {
    "next/link": { default: "Link", __esModule: true },
    react: { Suspense: "Suspense" },
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    "./MobileMenu": { default: "MobileMenu", __esModule: true },
    "./Search": { default: "Search", __esModule: true },
    "@/components/cart": { default: "Cart", __esModule: true },
    "@/components/common/skeleton/SearchSkeleton": { SearchSkeleton: "SearchSkeleton" },
    "@/components/common/skeleton/IconSkeleton": { IconSkeleton: "IconSkeleton" },
    "@components/theme/theme-switch": { default: "ThemeSwitcher", __esModule: true },
    "@components/common/icons/LogoIcon": { default: "LogoIcon", __esModule: true },
    "@components/customer/credentials": { default: "UserAccount", __esModule: true },
    "@/utils/server/storefront-seo": { getStorefrontSeoPayload: async () => branding },
    "@/graphql": {
      GET_TREE_CATEGORIES: "category-query",
      graphqlRequest: async (...args) => {
        calls.push(args);
        if (data === null) throw new Error("Fixture category failure");
        return { homeCategories: data };
      },
    },
  };
  const fixtureModule = { exports: {} };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, {
    module: fixtureModule, exports: fixtureModule.exports, console: { error() {} },
    require: (id) => { assert.ok(dependencies[id], `Unexpected dependency: ${id}`); return dependencies[id]; },
  });
  return { tree: plain(await fixtureModule.exports.default({ allowsCheckout, editorial })), calls: plain(calls) };
}

// Only layout classes and the new native tooltip may differ. Full link text,
// aria-labels, destinations, branding, data requests and action props stay equal.
const semantics = (value) => JSON.parse(JSON.stringify(value, (key, entry) => ["className", "title"].includes(key) ? undefined : entry));

test("navbar preserves long Unicode labels, branding, category limits, failure fallback and checkout permission", async () => {
  for (const data of [categories, [], null]) {
    for (const allowsCheckout of [true, false]) {
      for (const branding of [null, { image: "/fixture-brand.svg", siteName: "Fixture merchant" }]) {
        const props = { data, allowsCheckout, branding };
        const before = await renderNavbar({ ...props, baseline: true });
        const after = await renderNavbar(props);
        assert.deepEqual(semantics(after), semantics(before));
        assert.equal(nodes(after.tree, (node) => node.type === "Cart").length, allowsCheckout ? 1 : 0);
        assert.equal(nodes(after.tree, (node) => node.type === "UserAccount").length, 1);
        assert.equal(nodes(after.tree, (node) => node.type === "ThemeSwitcher").length, 1);
        const menu = nodes(after.tree, (node) => node.type === "MobileMenu")[0];
        assert.equal(menu.props.allowsCheckout, allowsCheckout);
        assert.equal(menu.props.menu.length, data?.length ? 4 : 1);
      }
    }
  }
  const { tree } = await renderNavbar();
  const links = nodes(nodes(tree, (node) => node.type === "ul")[0], (node) => node.type === "Link");
  assert.deepEqual(links.map((node) => node.props.children), ["Todo", ...names]);
  for (const link of links) {
    assert.equal(link.props["aria-label"], `Ver productos de ${link.props.children}`);
    assert.equal(link.props.title, link.props.children);
  }
});

function checkLayout(tree, { editorial = false } = {}) {
  const nav = nodes(tree, (node) => node.type === "nav")[0];
  const [brandAndMenu, search, actions] = nav.props.children.props.children;
  for (const flexible of [brandAndMenu, search]) {
    assert.ok(tokens(flexible).has("min-w-0"), "Text and search regions must be allowed to shrink");
  }
  assert.ok(tokens(brandAndMenu).has("max-w-fit"), "Preserve the intrinsic brand width on mobile/tablet and with short menus");
  assert.ok(tokens(brandAndMenu).has("lg:max-w-[50%]"), "Long desktop menus must leave room for search and actions");
  assert.ok(tokens(search).has("flex-1"));
  assert.ok(tokens(search).has("[&>div]:min-w-0"), "Override both Search and loading skeleton minimum widths within this navbar only");
  assert.ok(tokens(actions).has("shrink-0"), "Keep account/cart/theme actions in the available header width");
  const logo = nodes(brandAndMenu, (node) => node.type === "Link" && node.props.href === "/")[0];
  assert.ok(tokens(logo).has("shrink-0"));
  const list = nodes(brandAndMenu, (node) => node.type === "ul")[0];
  assert.ok(tokens(list).has("min-w-0"));
  for (const item of nodes(list, (node) => node.type === "li")) {
    assert.ok(tokens(item).has("min-w-0"));
    assert.ok(tokens(item).has(editorial ? "flex-initial" : "flex-1"), editorial
      ? "Editorial links must use their content width and remain shrinkable"
      : "Long category labels must share space without starving neighboring links");
    assert.ok(tokens(item.props.children).has("truncate"));
  }
  for (const region of [nav, brandAndMenu, search, actions]) {
    assert.ok(!tokens(region).has("overflow-hidden"), "Do not conceal overflowing controls by clipping the header");
  }
}

test("navbar has a shrinking text/search chain and protected actions; the pre-fix source fails this contract", async () => {
  const before = await renderNavbar({ baseline: true });
  assert.throws(() => checkLayout(before.tree), /must be allowed to shrink/);
  checkLayout((await renderNavbar()).tree);
});

test("editorial menus preserve exact destinations and keep even the first long link shrinkable", async () => {
  const editorial = { brand_name: "Marca editable", logo_url: "/fixture-editorial.svg", menu_links: Array.from({ length: 6 }, (_, index) => ({ label: names[index % names.length], url: `/help/topic-${index}?locale=es` })) };
  const { tree, calls } = await renderNavbar({ editorial });
  checkLayout(tree, { editorial: true });
  assert.equal(calls.length, 0, "An explicit menu must not be overwritten by category data");
  const list = nodes(tree, (node) => node.type === "ul")[0];
  for (const item of nodes(list, (node) => node.type === "li")) {
    assert.ok(!tokens(item).has("first:flex-none"));
    assert.ok(!tokens(item).has("flex-1"), "Six long editorial links must shrink from content, not equal zero bases");
  }
  assert.deepEqual(nodes(list, (node) => node.type === "Link").map((node) => node.props.href), editorial.menu_links.map((link) => link.url));
  const mobile = nodes(tree, (node) => node.type === "MobileMenu")[0];
  assert.deepEqual(mobile.props.menu.map((link) => link.href), editorial.menu_links.map((link) => link.url));
  assert.equal(nodes(tree, (node) => node.type === "Cart").length, 1);
  assert.equal(nodes(tree, (node) => node.type === "UserAccount").length, 1);
});

test("three short editorial labels keep their complete text and independent content-width bases", async () => {
  const menu_links = [
    { label: "Todo", url: "/search" },
    { label: "Celulares", url: "/search/celulares" },
    { label: "Cómputo", url: "/search/computadores" },
  ];
  const { tree, calls } = await renderNavbar({ editorial: { brand_name: "Marca editable", logo_url: "", menu_links } });
  checkLayout(tree, { editorial: true });
  assert.equal(calls.length, 0);
  const list = nodes(tree, (node) => node.type === "ul")[0];
  assert.ok(tokens(list).has("gap-4"));
  assert.ok(tokens(list).has("xl:gap-6"));
  assert.ok(tokens(list).has("text-sm"));
  const links = nodes(list, (node) => node.type === "Link");
  assert.deepEqual(links.map((link) => link.props.children), menu_links.map((link) => link.label));
  for (const item of nodes(list, (node) => node.type === "li")) {
    assert.equal(item.props.className, "min-w-0 flex-initial");
    assert.equal(item.props.children.props.title, item.props.children.props.children);
  }
  assert.equal(nodes(tree, (node) => node.type === "ThemeSwitcher").length, 1);
  assert.equal(nodes(tree, (node) => node.type === "Cart").length, 1);
  assert.equal(nodes(tree, (node) => node.type === "UserAccount").length, 1);
});

test("automatic category menus keep their prior sizing, including empty editorial-menu fallback", async () => {
  for (const editorial of [undefined, { brand_name: "Marca editable", logo_url: "", menu_links: [] }]) {
    const { tree } = await renderNavbar({ editorial });
    checkLayout(tree);
    const list = nodes(tree, (node) => node.type === "ul")[0];
    for (const item of nodes(list, (node) => node.type === "li")) {
      assert.equal(item.props.className, "min-w-0 flex-1 first:flex-none");
    }
  }
});

test("Tailwind emits navbar content-basis, child min-width and nonshrinking action rules", async () => {
  const file = path.join(root, "src/app/globals.css");
  const result = await postcss([tailwind({ base: root, optimize: true })]).process(readFileSync(file, "utf8"), { from: file });
  const css = postcss.parse(result.css);
  const found = new Set();
  css.walkRules((rule) => {
    if (rule.selector.replace(/\s+/g, "") === ".\\[\\&\\>div\\]\\:min-w-0>div") {
      rule.walkDecls("min-width", (decl) => {
        if (["0", "0px", "calc(var(--spacing)*0)"].includes(decl.value.replace(/\s+/g, ""))) found.add("search");
      });
    }
    if (rule.selectors.includes(".shrink-0")) {
      rule.walkDecls("flex-shrink", (decl) => { if (decl.value === "0") found.add("actions"); });
    }
    if (rule.selectors.includes(".flex-initial")) {
      rule.walkDecls("flex", (decl) => {
        if (["0 auto", "0 1 auto"].includes(decl.value)) found.add("content-basis");
      });
    }
  });
  assert.deepEqual([...found].sort(), ["actions", "content-basis", "search"]);
});
