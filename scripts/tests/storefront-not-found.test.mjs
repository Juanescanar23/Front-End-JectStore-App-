import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");

function loadSource(path, mocks) {
  const absolute = resolve(root, path);
  const file = [absolute, absolute + ".ts", absolute + ".tsx"].find(existsSync);
  assert.ok(file, path);
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const loaded = { exports: {} };
  const fakeRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("./")) return loadSource(resolve(dirname(file), name), mocks);
    if (name.startsWith("@/")) return loadSource("src/" + name.slice(2), mocks);
    return require(name);
  };
  new Function("require", "module", "exports", outputText)(fakeRequire, loaded, loaded.exports);
  return loaded.exports;
}

function app({ headers = new Headers({ host: "cafe.jectstore.test" }), channel = { name: 'Café <Nube> & "Lima"' }, error } = {}) {
  let lookups = 0;
  const component = loadSource("src/app/(public)/not-found.tsx", {
    "server-only": {},
    "next/headers": { headers: async () => headers },
    "next/navigation": { unstable_rethrow: (caught) => { if (caught.frameworkSignal) throw caught; } },
    "next/image": ({ unoptimized, ...props }) => {
      assert.equal(unoptimized, true);
      return React.createElement("img", props);
    },
    "@/components/common/StorefrontLink": ({ prefetch, ...props }) => {
      assert.equal(prefetch, false);
      return React.createElement("a", props);
    },
    "@components/common/button/EventButton": { EventButton: () => null },
    "@/utils/server/storefront-default-channel": {
      getStorefrontDefaultChannel: async () => {
        lookups++;
        if (error) throw error;
        return channel;
      },
    },
    "../not-found": () => React.createElement("h1", null, "404 global"),
  }).default;
  return {
    html: async () => renderToStaticMarkup(await component()),
    lookups: () => lookups,
  };
}

test("public 404 uses the confirmed channel name and a local CTA", async () => {
  const page = app();
  const html = await page.html();
  assert.match(html, /No encontramos esta página/);
  assert.match(html, /Puede que el producto ya no esté o que el enlace esté mal escrito\./);
  assert.match(html, /Café &lt;Nube&gt; &amp; &quot;Lima&quot;/);
  assert.match(html, /href="\/"[^>]*>.*Ver la tienda/);
  assert.match(html, /compass-duotone\.svg/);
  assert.match(html, /storefront-bold\.svg/);
  assert.match(html, /Tienda hecha con <a[^>]+href="https:\/\/jectstore\.com\//);
  assert.equal(page.lookups(), 1);
  const nameless = await app({ channel: { name: "   " } }).html();
  assert.match(nameless, /No encontramos esta página/);
  assert.doesNotMatch(nameless, /data-storefront-name/);
});

test("missing channel, central and untrusted forwarded hosts keep the global 404", async () => {
  for (const page of [
    app({ channel: null }),
    app({ error: new Error("Unavailable private backend") }),
    app({
      headers: new Headers({
        host: process.env.NEXT_PUBLIC_LANDLORD_HOST || "app.jectstore.com",
        "x-forwarded-host": "cafe.jectstore.test",
        "x-tenant-host": "cafe.jectstore.test",
      }),
    }),
    app({ headers: new Headers({ host: "wrong.com,cafe.jectstore.test" }) }),
  ]) {
    assert.equal(await page.html(), "<h1>404 global</h1>");
  }
  const central = app({ headers: new Headers({ host: process.env.NEXT_PUBLIC_LANDLORD_HOST || "app.jectstore.com" }) });
  await central.html();
  assert.equal(central.lookups(), 0);
  const signal = Object.assign(new Error("Next dynamic render signal"), { frameworkSignal: true });
  await assert.rejects(app({ error: signal }).html, (err) => err === signal);
});

test("the 404 kit rules do not style any other storefront region", () => {
  const css = postcss.parse(readFileSync(resolve(root, "public/storefront-closed/not-found.css"), "utf8"));
  css.walkRules((rule) => {
    if (rule.parent.type === "atrule" && rule.parent.name === "keyframes") {
      assert.equal(rule.parent.params, "jectstore-storefront-v3-404-button-pop");
      return;
    }
    assert.ok(rule.selectors.every((selector) => selector.includes("[data-storefront-v3-not-found]")), rule.selector);
  });
});
