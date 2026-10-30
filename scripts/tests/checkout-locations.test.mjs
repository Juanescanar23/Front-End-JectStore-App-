import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { createFormControl } from "react-hook-form";

const root = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
function loader(mocks = {}) {
  const cache = new Map();
  const load = (relative) => {
    const candidate = path.resolve(root, relative);
    const file = [candidate, `${candidate}.ts`, `${candidate}/index.ts`].find((entry) => existsSync(entry) && statSync(entry).isFile());
    assert.ok(file, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const fixtureModule = { exports: {} };
    cache.set(file, fixtureModule);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", output)((name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/")) return load(`src/${name.slice(2)}`);
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name));
      return require(name);
    }, fixtureModule, fixtureModule.exports);
    return fixtureModule.exports;
  };
  return load;
}

const countries = { data: [{ code: "CO", name: "Colombia" }, { code: "MX", name: "México" }, { code: "SG", name: "Singapur" }] };
const states = { data: {
  CO: [{ code: "DC", default_name: "Bogotá, D.C.", country_code: "CO" }],
  MX: [{ code: "CMX", default_name: "Ciudad de México", country_code: "MX" }],
} };
const helper = loader()("src/utils/checkout-address-location.ts");
const catalog = helper.parseCheckoutLocations(countries, states);

test("canonical public country/state shapes produce codes and labels without an implicit country", () => {
  assert.deepEqual(catalog, {
    countries: countries.data,
    states: { CO: [{ code: "DC", name: "Bogotá, D.C." }], MX: [{ code: "CMX", name: "Ciudad de México" }], SG: [] },
  });
  for (const value of [undefined, null, "", "IN/UP", "Colombia", "../CO", 57]) assert.equal(helper.checkoutCountryCode(value), "");
  assert.equal(helper.checkoutCountryCode(" co "), "CO");
  assert.equal(helper.checkoutLocationError("", "", catalog), "country");
  assert.equal(helper.checkoutLocationError("IN", "UP", catalog), "country");
});

test("preserves saved country/state and resolves saved region names only inside the selected country", () => {
  assert.equal(helper.checkoutRegionCode("CO", "DC", catalog), "DC");
  assert.equal(helper.checkoutRegionCode("CO", "Bogota D.C.", catalog), "DC");
  assert.equal(helper.checkoutRegionCode("MX", "Ciudad de México", catalog), "CMX");
  assert.equal(helper.checkoutLocationError("MX", "DC", catalog), "state");
  assert.equal(helper.checkoutLocationError("CO", "CMX", catalog), "state");
  assert.equal(helper.checkoutLocationError("CO", "Bogotá D.C.", catalog), null);
  assert.equal(helper.checkoutLocationError("SG", "", catalog), null);
  assert.equal(helper.checkoutRegionCode("SG", "Custom region", catalog), "Custom region");
  assert.deepEqual(helper.checkoutLocationAfterCountryChange("CO", "MX", "DC"), { country: "MX", state: "" });
  assert.deepEqual(helper.checkoutLocationAfterCountryChange("CO", "co", "DC"), { country: "CO", state: "DC" });
});

test("real RHF reset keeps an edited country and empty region together when saved addresses arrive late", () => {
  for (const [country, state] of [["SG", ""], ["MX", "CMX"], ["CO", ""]]) {
    const form = createFormControl({ defaultValues: { billing: { country: "", state: "" } } });
    form.register("billing.country");
    form.register("billing.state");
    form.setValue("billing.country", country, { shouldDirty: true });
    form.setValue("billing.state", state, { shouldDirty: true });
    const location = helper.checkoutLocationForReset({ country: "CO", state: "DC" }, form.getValues().billing, form.getFieldState("billing.country").isDirty);
    form.reset({ billing: location }, { keepDirtyValues: true });
    assert.deepEqual(form.getValues().billing, { country, state });
  }
  const untouched = createFormControl({ defaultValues: { billing: { country: "", state: "" } } });
  untouched.register("billing.country");
  untouched.register("billing.state");
  const location = helper.checkoutLocationForReset({ country: "CO", state: "DC" }, untouched.getValues().billing, false);
  untouched.reset({ billing: location }, { keepDirtyValues: true });
  assert.deepEqual(untouched.getValues().billing, { country: "CO", state: "DC" });
});

test("malformed, duplicate and foreign region rows never become selectable shipping codes", () => {
  const parsed = helper.parseCheckoutLocations({ data: [null, { code: "CO", name: "Colombia" }, { code: "CO", name: "Duplicate" }, { code: "../", name: "bad" }] },
    { data: { CO: [null, { code: "DC", default_name: "Bogotá", country_code: "MX" }, { code: "<script>", default_name: "bad" }], MX: states.data.MX } });
  assert.deepEqual(parsed, { countries: [{ code: "CO", name: "Colombia" }], states: { CO: [] } });
  assert.deepEqual(helper.parseCheckoutLocations({ countries: countries.data }, []), { countries: [], states: {} });
});

test("state envelope accepts canonical grouped arrays and PHP's empty [], never missing or malformed data", () => {
  for (const value of [states, { data: {} }, { data: [] }]) assert.equal(helper.isCanonicalCheckoutStatesPayload(value), true);
  for (const value of [null, [], {}, { message: "error" }, { data: null }, { data: "failed" }, { data: [states] }, { data: { CO: null } }]) {
    assert.equal(helper.isCanonicalCheckoutStatesPayload(value), false);
  }
});

function transportFixture(t, responseFor) {
  const previous = process.env.STOREFRONT_BACKEND_ORIGIN;
  process.env.STOREFRONT_BACKEND_ORIGIN = "http://127.0.0.1:9";
  t.after(() => { if (previous === undefined) delete process.env.STOREFRONT_BACKEND_ORIGIN; else process.env.STOREFRONT_BACKEND_ORIGIN = previous; });
  const calls = [];
  const request = (url, options, callback) => {
    calls.push({ url: String(url), options });
    const outgoing = new EventEmitter();
    outgoing.end = () => queueMicrotask(() => {
      const config = responseFor(url, options);
      const incoming = new EventEmitter();
      incoming.statusCode = config.status || 200;
      incoming.headers = { "content-type": "application/json", ...config.headers };
      incoming.destroy = () => { incoming.destroyed = true; };
      callback(incoming);
      if (incoming.destroyed) return;
      incoming.emit("data", Buffer.from(typeof config.body === "string" ? config.body : JSON.stringify(config.body)));
      incoming.emit("end");
    });
    return outgoing;
  };
  const load = loader({ "node:http": { request }, "node:https": { request } });
  return { load, calls };
}

test("guest checkout fetches only fixed backend paths with the actual tenant Host, not host query or forwarding hints", async (t) => {
  const fixture = transportFixture(t, (url) => ({ body: url.pathname.endsWith("countries") ? countries : states }));
  assert.deepEqual(await fixture.load("src/utils/server/checkout-locations.ts").getCheckoutLocations("demo.jectstore.com"), catalog);
  assert.deepEqual(fixture.calls.map((call) => call.url).sort(), ["http://127.0.0.1:9/api/locations/countries", "http://127.0.0.1:9/api/locations/states"]);
  for (const { options } of fixture.calls) {
    assert.deepEqual(options.headers, { Host: "demo.jectstore.com", Accept: "application/json" });
    assert.equal(options.method, "GET");
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test("same server module keeps tenant metadata independent, without global response cache", async (t) => {
  const fixture = transportFixture(t, (url, options) => ({ body: options.headers.Host === "demo.jectstore.com"
    ? (url.pathname.endsWith("countries") ? { data: [countries.data[0]] } : states)
    : (url.pathname.endsWith("countries") ? { data: [countries.data[1]] } : states) }));
  const service = fixture.load("src/utils/server/checkout-locations.ts");
  assert.deepEqual((await service.getCheckoutLocations("demo.jectstore.com")).countries.map((row) => row.code), ["CO"]);
  assert.deepEqual((await service.getCheckoutLocations("brandealove.jectstore.com")).countries.map((row) => row.code), ["MX"]);
  assert.equal(fixture.calls.length, 4);
});

test("valid countries plus malformed state envelope fail closed rather than becoming optional free text", async (t) => {
  let badState = { data: null };
  const fixture = transportFixture(t, (url) => ({ body: url.pathname.endsWith("countries") ? countries : badState }));
  const service = fixture.load("src/utils/server/checkout-locations.ts");
  for (const invalid of [{ data: null }, { message: "error" }, { data: [{ code: "DC" }] }, { data: "bad" }]) {
    badState = invalid;
    await assert.rejects(service.getCheckoutLocations("demo.jectstore.com"), /checkout-locations-unavailable/);
  }
});

for (const [label, bad] of [
  ["redirect", { status: 302, headers: { location: "https://other.invalid" }, body: {} }],
  ["wrong type", { headers: { "content-type": "text/html" }, body: "not JSON" }],
  ["oversized header", { headers: { "content-length": String(3 * 1024 * 1024) }, body: {} }],
  ["invalid JSON", { body: "{" }],
  ["missing countries", { body: { data: [] } }],
]) test(`checkout locations fail closed on ${label} without upstream error details`, async (t) => {
  const fixture = transportFixture(t, () => bad);
  await assert.rejects(fixture.load("src/utils/server/checkout-locations.ts").getCheckoutLocations("demo.jectstore.com"), /checkout-locations-unavailable/);
  assert.equal(fixture.calls.length, 2);
});

test("invalid host is rejected before any transport; country cannot select an arbitrary destination", async (t) => {
  const fixture = transportFixture(t, () => { throw new Error("No request expected"); });
  for (const host of ["https://other.invalid/", "demo.jectstore.com,other.invalid", "../demo", "Demo.jectstore.com"]) {
    await assert.rejects(fixture.load("src/utils/server/checkout-locations.ts").getCheckoutLocations(host));
  }
  assert.equal(fixture.calls.length, 0);
});

test("guest address fields are explicit for billing and shipping, with no silent IN/UP fallback", () => {
  const source = readFileSync(path.join(root, "src/components/checkout/stepper/GuestAddAdressForm.tsx"), "utf8");
  assert.doesNotMatch(source, /\|\|\s*["'](?:IN|UP)["']/);
  assert.match(source, /locationFields\("billing"\)/);
  assert.match(source, /locationFields\("shipping"\)/);
  assert.match(source, /register\(`\$\{kind\}\.country`/);
  assert.match(source, /register\(`\$\{kind\}\.state`/);
  assert.match(source, /checkoutRegionCode\(billing.country, billing.state, locations\)/);
  assert.match(source, /checkoutRegionCode\(shipping.country, shipping.state, locations\)/);
  assert.match(source, /keepDirtyValues:\s*true/);
  assert.match(source, /Tus datos siguen en el formulario/);
});

function arrowFromSource(relative, variable, scope, property = null) {
  const source = ts.createSourceFile(relative, readFileSync(path.join(root, relative), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source).includes(variable)) {
      if (property && ts.isCallExpression(node.initializer)) {
        found = node.initializer.arguments[0].properties.find((entry) => entry.name?.getText(source) === property)?.initializer;
      } else if (!property && node.name.getText(source) === variable) found = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(found && ts.isArrowFunction(found), `Missing actual ${variable}/${property || "handler"}`);
  const output = ts.transpileModule(`exports.handler = ${found.getText(source)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function(...Object.keys(scope), "exports", output)(...Object.values(scope), exports);
  return exports.handler;
}

const addressResult = { data: { createCheckoutAddress: { checkoutAddress: { success: true, message: "Guardada" } } } };

test("real checkout hook returns the mutation result, including a resolved GraphQL validation failure", async () => {
  for (const result of [addressResult, { error: { message: "Estado requerido" } }]) {
    let payload;
    const action = arrowFromSource("src/utils/hooks/useCheckout.ts", "saveCheckoutAddress", {
      getCartToken: () => "synthetic-guest-token", saveAddressToCheckout: async (value) => { payload = value; return result; },
      submitOnce: loader()("src/utils/checkout-submit.ts").createCheckoutSubmissionGuard(),
    });
    assert.equal(await action({ billingCountry: "CO" }), result);
    assert.deepEqual(payload, { token: "synthetic-guest-token", billingCountry: "CO" });
  }
});

test("real hook success callback navigates only on explicit success and shows validation errors through existing toast", () => {
  for (const result of [addressResult, { data: { createCheckoutAddress: { checkoutAddress: { success: false } } } }, { error: { message: "Estado requerido" } }, {}]) {
    const notices = [], navigation = [], invalidations = [];
    const callback = arrowFromSource("src/utils/hooks/useCheckout.ts", "saveAddressToCheckout", {
      isCheckoutAddressSaveSuccessful: helper.isCheckoutAddressSaveSuccessful,
      showToast: (...args) => notices.push(args), router: { replace: (value) => navigation.push(value) },
      queryClient: { invalidateQueries: (value) => invalidations.push(value) },
    }, "onSuccess");
    callback(result);
    if (result === addressResult) {
      assert.deepEqual(navigation, ["/checkout?step=shipping"]);
      assert.equal(invalidations.length, 2);
      assert.equal(notices[0][1], "success");
    } else {
      assert.deepEqual(navigation, []);
      assert.deepEqual(invalidations, []);
      assert.equal(notices[0][1], "warning");
      assert.ok(notices[0][0]);
    }
  }
});

test("real guest submit preserves fields and summary state on failure, then summarizes valid country/state only on success", async () => {
  for (const result of [addressResult, { error: { message: "Estado requerido" } }, { data: { createCheckoutAddress: { checkoutAddress: { success: false } } } }]) {
    const changes = [], submitted = [];
    const action = arrowFromSource("src/components/checkout/stepper/GuestAddAdressForm.tsx", "addGuestAddress", {
      ...helper, locations: catalog, email: "synthetic@fixture.invalid",
      isLoadingToSave: false, locationsLoading: false, locationsError: false,
      saveCheckoutAddress: async (value) => { submitted.push(value); return result; },
      dispatch: (value) => changes.push(["dispatch", value]), setCheckoutAddresses: (value) => value,
      setBillingAddress: (value) => changes.push(["billing", value]), setShippingAddress: (value) => changes.push(["shipping", value]),
      setIsOpen: (value) => changes.push(["open", value]), console: { error: () => assert.fail("Unexpected handler failure") },
    });
    const fields = { billing: { firstName: "DEMO", country: "CO", state: "Bogotá D.C.", phone: "2025550143" }, shipping: {}, useForShipping: true };
    const before = JSON.stringify(fields);
    await action(fields);
    assert.equal(JSON.stringify(fields), before);
    assert.equal(submitted[0].billingCountry, "CO");
    assert.equal(submitted[0].billingState, "DC");
    assert.equal(submitted[0].billingPhoneNumber, "2025550143");
    assert.equal(changes.length, result === addressResult ? 4 : 0);
  }
});
