import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const rejected = "No pudimos agregar el producto. Revisa la cantidad e inténtalo de nuevo.";
const failed = "No pudimos agregar el producto. Vuelve a intentarlo.";
const secret = "synthetic-sensitive-value-never-for-client";
const request = () => new Request("https://tenant.test/api/cart/addToCart", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ productId: 3, quantity: 1, cartId: null }),
});

function loader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    const path = resolve(root, relative);
    const file = [path, `${path}.ts`, `${path}/index.ts`]
      .find(candidate => existsSync(candidate) && statSync(candidate).isFile());
    assert.ok(file, `Missing real source ${relative}`);
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/")) return load(`src/${name.slice(2)}`);
      if (name.startsWith("@utils/")) return load(`src/utils/${name.slice(7)}`);
      if (name.startsWith(".")) return load(resolve(dirname(file), name));
      assert.ok(name.startsWith("node:"), `Unexpected dependency ${name}`);
      return require(name);
    };
    new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  }
  return load;
}

function harness({ error, result } = {}) {
  const calls = [];
  let failure = error;
  const load = loader({
    "@/graphql": { CREATE_ADD_PRODUCT_IN_CART: "synthetic-unchanged-document" },
    "@utils/helper": { getAuthToken: () => "synthetic-current-cart-proof" },
    "next/headers": {},
    "@/utils/bagisto": { bagistoFetch: async options => {
      calls.push(options);
      if (failure !== undefined) throw failure;
      return result;
    } },
  });
  return { load, calls, setError: value => { failure = value; }, POST: load("src/app/api/cart/addToCart/route.ts").POST };
}

function envelope(message) {
  return { data: { createAddProductInCart: null }, error: { message } };
}

test("actual Add handler normalizes only its exact root GraphQL error without reflecting backend information", async () => {
  const h = harness({ error: {
    message: secret, path: ["createAddProductInCart"], locations: [{ line: 2, column: 3 }],
    extensions: { debugMessage: secret, trace: [secret], token: secret },
    stack: secret, cause: { cookie: secret }, cookies: secret,
  } });
  const response = await h.POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), envelope(rejected));
  assert.equal(h.calls.length, 1, "No retry or recovery mutation");
});

test("unknown, malformed, inherited and unrelated thrown values remain clean HTTP 500 failures", async () => {
  const withGetter = Object.defineProperty({}, "message", { get() { throw new Error(secret); } });
  const pathGetter = ["createAddProductInCart"];
  Object.defineProperty(pathGetter, "0", { get() { throw new Error(secret); } });
  for (const error of [
    new Error(secret), new TypeError(secret), null, secret, [],
    { message: secret }, { message: secret, path: "createAddProductInCart" },
    { message: secret, path: [] }, { message: secret, path: ["createCheckoutOrder"] },
    { message: secret, path: ["createAddProductInCart", "addProductInCart"] },
    { message: "", path: ["createAddProductInCart"] },
    { message: "x".repeat(4097), path: ["createAddProductInCart"] },
    { message: secret, path: pathGetter }, withGetter,
    Object.create({ message: secret, path: ["createAddProductInCart"] }),
    Object.assign(Object.create(null), { message: secret, path: ["createAddProductInCart"] }),
    { graphQLErrors: [{ message: secret, path: ["createAddProductInCart"] }] },
  ]) {
    const h = harness({ error });
    const response = await h.POST(request());
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), envelope(failed));
    assert.equal(h.calls.length, 1);
  }
});

test("the scoped normalizer itself tolerates an uninspectable thrown object", async () => {
  const load = loader();
  const response = load("src/utils/server/add-to-cart-error.ts").addToCartFailureResponse(
    new Proxy({}, { getPrototypeOf() { throw new Error(secret); } }),
  );
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), envelope(failed));
});

test("typed unavailable and rate-limited responses retain precedence over Add error normalization", async () => {
  for (const kind of ["unavailable", "limited"]) {
    const h = harness();
    const error = kind === "unavailable"
      ? new (h.load("src/utils/server/client-context.ts").StorefrontConnectionUnavailable)()
      : new (h.load("src/utils/server/storefront-http-error.ts").StorefrontRateLimited)("17");
    Object.assign(error, { message: secret, path: ["createAddProductInCart"], cause: secret });
    h.setError(error);
    const response = await h.POST(request());
    assert.equal(response.status, kind === "unavailable" ? 503 : 429);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("retry-after"), kind === "unavailable" ? "5" : "17");
    assert.deepEqual(await response.json(), kind === "unavailable"
      ? { message: "No pudimos conectar con la tienda. Vuelve a intentarlo." }
      : { message: "Has realizado demasiados intentos. Espera un momento y vuelve a intentarlo.", retry_after: 17 });
    assert.equal(h.calls.length, 1);
  }
});

test("successful Add keeps the existing payload, variables and guest proof unchanged", async () => {
  const data = { createAddProductInCart: { addProductInCart: {
    id: "7", success: true, sessionToken: "synthetic-owned-guest-proof", isGuest: true,
    cartToken: "7", itemsQty: 1, itemsCount: 1, items: { edges: [] },
  } } };
  const h = harness({ result: { status: 200, body: { data } } });
  const response = await h.POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data });
  assert.deepEqual(h.calls, [{ query: "synthetic-unchanged-document",
    variables: { productId: 3, quantity: 1, cartId: null }, cache: "no-store", guestToken: "synthetic-current-cart-proof" }]);
});
