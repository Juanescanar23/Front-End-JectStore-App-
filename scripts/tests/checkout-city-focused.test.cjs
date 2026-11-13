const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const source = (path) => readFileSync(join(__dirname, path), "utf8");
const { outputText } = ts.transpileModule(source("../../src/utils/checkout-address-location.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const loaded = {};
new Function("exports", outputText)(loaded);
const { isValidCheckoutCity, normalizeCheckoutCity } = loaded;

test("international city names accept composed and decomposed spelling and normal separators", () => {
  for (const name of ["Bogotá", "Bogotá, D.C.", "São Paulo", "Ciudad de México", "L'Île-Perrot",
    "Val-d’Or", "Frankfurt (Oder)", "ʻEwa Beach", "北京", "東京", "Санкт-Петербург", "کریم‌شهر",
    "नई दिल्ली", "مدينة ٦ أكتوبر"]) {
    assert.equal(isValidCheckoutCity(name), true, name);
    assert.equal(isValidCheckoutCity(name.normalize("NFD")), true, name);
    assert.equal(normalizeCheckoutCity("\u00a0" + name.normalize("NFD") + " "), name.normalize("NFC"));
  }
});

test("invalid city inputs still fail", () => {
  for (const invalid of [null, 42, "", "   ", "0123", "---", "ʼ", "<b>Bogotá</b>", "Bogotá\n", "A\tB",
    "\u0301X", "A \u0301B", "A\u200c", "A \u200dB", "A\u202eB", "A🙂", "A".repeat(256)]) {
    assert.equal(isValidCheckoutCity(invalid), false, JSON.stringify(invalid));
  }
  assert.equal(isValidCheckoutCity("A".repeat(255)), true);
});

test("both checkout city fields validate and normalize; same-address semantics stay intact", () => {
  const form = source("../../src/components/checkout/stepper/GuestAddAdressForm.tsx");
  for (const kind of ["billing", "shipping"]) {
    assert.match(form, new RegExp('register\\("' + kind + '\\.city", \\{\\s+required: .*\\s+validate: \\(value\\) => isValidCheckoutCity\\(value\\)'));
    assert.match(form, new RegExp('city: normalizeCheckoutCity\\(data\\.' + kind + '\\.city\\)'));
  }
  assert.match(form, /shippingSource = useForShipping \? billing : shipping/);
  assert.match(form, /if \(!useForShipping\) \{\s+payload\.shippingFirstName/);
});
