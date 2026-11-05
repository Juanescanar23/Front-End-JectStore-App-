import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

const passthrough = ({ children }) => children;
const dependencies = {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "next-auth/react": {
    SessionContext: React.createContext(null),
    SessionProvider: passthrough,
  },
};
function load(path) {
  const source = readFileSync(new URL("../../" + path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    assert.ok(Object.hasOwn(dependencies, name), name);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

test("read-only preview suppresses all Link prefetch without changing anchors or public preferences", () => {
  const observed = [];
  const session = load("src/providers/SessionProvider.tsx");
  dependencies["@/providers/SessionProvider"] = session;
  dependencies["next/link"] = { __esModule: true, default: ({ prefetch, replace, onClick, ref, ...anchor }) => {
    observed.push({ prefetch, replace, onClick, ref });
    return React.createElement("a", anchor);
  } };
  const { default: StorefrontLink } = load("src/components/common/StorefrontLink.tsx");
  const onClick = () => {};
  const ref = React.createRef();
  for (const [href, prefetch] of [["/", undefined], ["/search", true], ["/search?q=fixture", false]]) {
    for (const readonlyPreview of [true, false]) {
      const link = React.createElement(StorefrontLink, {
        href, prefetch, replace: true, onClick, ref, className: "incumbent", "aria-label": "Abrir", children: "Buscar",
      });
      const html = renderToStaticMarkup(React.createElement(session.SessionProvider, { readonlyPreview }, link));
      assert.equal(html, `<a href="${href}" class="incumbent" aria-label="Abrir">Buscar</a>`);
      assert.deepEqual(observed.pop(), { prefetch: readonlyPreview ? false : prefetch, replace: true, onClick, ref });
    }
  }
});
