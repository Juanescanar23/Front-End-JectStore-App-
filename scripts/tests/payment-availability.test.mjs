import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const file = "src/components/checkout/stepper/payment/index.tsx";
const jsx = (type, props) => ({ type, props: props || {} });
const nodes = (tree, type) => {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  if (!tree || typeof tree !== "object") return [];
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
};
const text = (tree) => typeof tree === "string" ? tree : Array.isArray(tree) ? tree.map(text).join("") : tree && typeof tree === "object" ? text(tree.props?.children) : "";
const tick = () => new Promise(setImmediate);
const allowed = [{ method: "fixture-approved", title: "Método autorizado de prueba" }];

function fixture(t, replies, { token = "synthetic-cart-only", cod = null } = {}) {
  const calls = [], advances = [], codQueries = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let observer, unsubscribe;
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useMemo: (callback) => callback() },
    "@/components/common/skeleton/CheckoutSkeleton": { CartCheckoutPageSkeleton: "CartCheckoutPageSkeleton" },
    "@/store/hooks": { useAppSelector: (selector) => selector({ cartDetail: { cart: { items: { edges: [{ node: { productId: 7 } }] } } } }) },
    "@utils/getCartToken": { getCartToken: () => token },
    "./PaymentMethod": { default: "PaymentMethod", __esModule: true },
    "@utils/fetch-handler": { fetchHandler: async (options) => {
      calls.push(options);
      const reply = replies.shift();
      assert.notEqual(reply, undefined, "Unexpected automatic payment request");
      if (reply instanceof Error) throw reply;
      return await reply;
    } },
    "@tanstack/react-query": {
      useQuery: (options) => {
        if (!observer) {
          observer = new QueryObserver(client, options);
          unsubscribe = observer.subscribe(() => {});
        }
        return observer.getCurrentResult();
      },
      useQueries: ({ queries }) => { codQueries.push(queries); return queries.map(() => ({ data: cod, isLoading: false, isFetching: false })); },
    },
  };
  const output = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const fixtureModule = { exports: {} };
  new Function("require", "module", "exports", output)(
    (name) => { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; },
    fixtureModule, fixtureModule.exports,
  );
  t.after(() => { unsubscribe?.(); client.clear(); });
  return {
    calls, advances, codQueries,
    render: (props = {}) => fixtureModule.exports.default({ isOpen: true, setIsOpen: (value) => advances.push(value), ...props }),
    refetch: () => observer.refetch(),
  };
}

function assertUnavailable(tree, failed = false) {
  assert.equal(nodes(tree, "PaymentMethod").length, 0, "Do not mount the pay/advance form without approved methods");
  assert.equal(nodes(tree, "form").length, 0);
  assert.doesNotMatch(text(tree), /Pagar ahora/);
  assert.match(text(tree), failed ? /No pudimos consultar los métodos de pago/ : /No hay métodos de pago disponibles/);
  assert.match(text(tree), /Consultar los métodos no realiza cobros/);
  const notice = nodes(tree, "p").find((node) => node.props.role === "status");
  assert.ok(notice);
  assert.match(notice.props.className, /text-sf-muted/);
  const button = nodes(tree, "button")[0];
  assert.ok(button);
  assert.equal(button.props.type, "button");
  assert.equal(text(button), "Volver a consultar");
  return button;
}

test("actual payment component keeps initial loading then explains HTTP 200 [] without a pay action", async (t) => {
  const h = fixture(t, [{ data: [] }]);
  assert.equal(h.render().type, "CartCheckoutPageSkeleton");
  await tick();
  const button = assertUnavailable(h.render({ selectedPayment: "stale-method", isOpen: false }));
  assert.equal(button.props.disabled, false);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.advances, []);
  assert.ok(h.codQueries.every((queries) => queries.every((query) => !query.enabled)));
});

for (const reply of [{ data: null, error: { message: "sensitive-fixture-error" } }, new Error("sensitive-fixture-error")]) {
  test(`actual payment component shows safe recovery for ${reply instanceof Error ? "rejected" : "resolved"} query errors`, async (t) => {
    const h = fixture(t, [reply]); h.render(); await tick();
    const tree = h.render(); assertUnavailable(tree, true);
    assert.doesNotMatch(text(tree), /sensitive-fixture-error/);
    assert.deepEqual(h.advances, []);
  });
}

test("actual query retry disables its control, never advances, then restores only returned payment methods", async (t) => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const h = fixture(t, [{ data: [] }, pending]); h.render(); await tick();
  const button = assertUnavailable(h.render());
  button.props.onClick();
  assert.equal(assertUnavailable(h.render()).props.disabled, true);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.advances, []);
  resolve({ data: allowed }); await tick();
  const restored = h.render();
  assert.equal(restored.type, "PaymentMethod");
  assert.deepEqual(restored.props.methods, allowed);
  assert.deepEqual(h.advances, []);
});

test("a failed refresh cannot leave stale approved options actionable", async (t) => {
  const h = fixture(t, [{ data: allowed }, new Error("sensitive-stale-error")]); h.render(); await tick();
  assert.equal(h.render().type, "PaymentMethod");
  await h.refetch();
  assertUnavailable(h.render(), true);
  assert.deepEqual(h.advances, []);
});

test("COD removed by backend policy yields the same empty state without inventing a fallback", async (t) => {
  const h = fixture(t, [{ data: [{ method: "cashondelivery", title: "Contraentrega" }] }], { cod: { available: false, reason: "plan_disallows_cod" } });
  h.render(); await tick(); assertUnavailable(h.render());
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.advances, []);
});

test("product-blocked COD retains its authored disabled method and no cart token cannot trigger a retry", async (t) => {
  const h = fixture(t, [{ data: [{ method: "cashondelivery", title: "Contraentrega" }] }], { cod: { available: false, reason: "product_blocks_cod" } });
  h.render(); await tick();
  const tree = h.render({ selectedPayment: "cashondelivery", isOpen: false });
  assert.equal(tree.type, "PaymentMethod");
  assert.equal(tree.props.methods[0].disabled, true);
  assert.equal(tree.props.methods[0].helperMessage, "Este producto no está disponible para pago contra entrega.");
  assert.equal(tree.props.selectedPayment, undefined);
  assert.equal(tree.props.isOpen, true);
  const absent = fixture(t, [], { token: null });
  assert.equal(assertUnavailable(absent.render(), true).props.disabled, true);
  assert.deepEqual(absent.calls, []);
});
