import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";

// Cross-language gate: execute our validator against synthetic PHP-generated JSON.
// No fixture content is evaluated as code, and no environment/production data is read.
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
function load(relative) {
  const file = resolve(root, relative);
  const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)((name) => name.startsWith(".") ? load(resolve(dirname(file), `${name}.ts`)) : require(name), loaded, loaded.exports);
  return loaded.exports;
}
assert.equal(process.argv.length, 3, "Pass the path of the synthetic PHP contract fixture.");
const fixture = JSON.parse(readFileSync(resolve(process.argv[2]), "utf8"));
const { parseNextStorefrontDocument } = load("src/lib/storefront-experience/document.ts");
const { parseStorefrontExperience } = load("src/lib/storefront-experience/runtime.ts");
parseNextStorefrontDocument(fixture.empty_document);
const imported = parseNextStorefrontDocument(fixture.imported_document);
const preview = parseStorefrontExperience(fixture.preview_envelope, true);
const unicode = parseNextStorefrontDocument(fixture.unicode_document);
assert.equal(Array.from(unicode.regions.header.settings.brand_name).length, 80);
assert.throws(() => parseNextStorefrontDocument(fixture.unicode_overflow_document), /brand_name/);
console.log(`Storefront PHP→Next contract PASS: defaults, ${imported.sections.length} imported sections, authorized preview (${preview.currency}), Unicode 80 accepted / 81 rejected.`);
