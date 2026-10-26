import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { checkBuiltStyles, checkStylesheets, requiredStyles } from "../check-storefront-styles.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const escapeClass = (value) => `.${value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")}`;
const validCss = requiredStyles.map((check) => {
  const rule = `${escapeClass(check.className)}{${check.property}:${check.values[0]}}`;
  return check.minWidth ? `@media(min-width:${check.minWidth}px){${rule}}` : rule;
}).join("\n");
const checkCss = (css) => checkStylesheets([{ file: "fixture.css", css }]);

function temporaryDirectory(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "jectstore-styles-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeFixture(directory, file, content) {
  const destination = path.join(directory, file);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, content);
  return destination;
}

function compilationFixture(t) {
  const directory = temporaryDirectory(t);
  const project = path.join(directory, "project");
  const unrelated = path.join(directory, "unrelated");
  mkdirSync(project);
  mkdirSync(unrelated);
  cpSync(path.join(root, ".gitignore"), path.join(project, ".gitignore"));
  // Isolated source fixture, no .env, .next, user duplicates or generated CSS.
  for (const file of new Set(["hero.ts", ...requiredStyles.map((check) => check.source)])) {
    const destination = path.join(project, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(root, file), destination);
  }
  symlinkSync(path.join(root, "node_modules"), path.join(project, "node_modules"), "dir");
  const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
  let sequence = 0;
  return {
    project,
    unrelated,
    css,
    async compile({ source = css, base = unrelated, optimize = true } = {}) {
      // A unique input avoids Tailwind's incremental compiler cache between cases.
      const file = writeFixture(project, `src/app/fixture-${sequence++}.css`, source);
      return (await postcss([tailwind({ base, optimize })]).process(source, { from: file })).css;
    },
  };
}

function buildFixture(t, css = validCss, activePath = "static/chunks/active.css") {
  const directory = temporaryDirectory(t);
  writeFixture(directory, "BUILD_ID", "test-candidate");
  writeFixture(directory, "server/app/(public)/page_client-reference-manifest.js", `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/(public)/page"]=${JSON.stringify({
    entryCSSFiles: { "[project]/src/app/layout": [{ path: activePath, inlined: false }] },
  })};`);
  writeFixture(directory, "static/chunks/active.css", css);
  return directory;
}

test("checks declarations and responsive conditions, not selector strings", () => {
  assert.equal(checkCss(validCss), requiredStyles.length);
  assert.throws(() => checkCss(`/* ${validCss} */`), /Incomplete storefront CSS/);
  assert.throws(() => checkCss(".grid-cols-2{}"), /grid-cols-2/);
  assert.throws(() => checkCss(validCss.replace("display:none", "display:block")), /lg:hidden/);
  assert.throws(() => checkCss(validCss.replaceAll("min-width:1024px", "min-width:768px")), /lg:hidden/);
  assert.throws(() => checkCss(validCss.replace("aspect-ratio:1.97", "aspect-ratio:auto")), /aspect-\[1.97\/1\]/);
  assert.throws(() => checkCss(validCss.replace(".grid-cols-2{", ".grid-cols-2:hover{")), /grid-cols-2/);
  assert.throws(() => checkCss(validCss.replace(".grid-cols-2{", ".grid-cols-20{")), /grid-cols-2/);
  assert.throws(() => checkStylesheets([]), /No active storefront stylesheets/);
  assert.throws(() => checkCss(".broken{"), /Unclosed block/);
});

test("requires the real theme token behind font-size variables", () => {
  const variableCss = validCss.replace("font-size:2.25rem", "font-size:var(--text-4xl)");
  assert.throws(() => checkCss(variableCss), /md:text-4xl/);
  assert.throws(() => checkCss(`:root{--text-4xl:0}${variableCss}`), /md:text-4xl/);
  assert.equal(checkCss(`@layer theme{:root,:host{--text-4xl:2.25rem}}${variableCss}`), requiredStyles.length);
});

test("section inspection feedback is preview-only, semantic and does not change layout", () => {
  const stylesheet = postcss.parse(readFileSync(path.join(root, "src/app/globals.css"), "utf8"));
  const rules = [];
  stylesheet.walkRules((rule) => { if (rule.selector.includes("next-storefront-preview")) rules.push(rule); });
  assert.equal(rules.length, 2);
  for (const rule of rules) {
    for (const selector of rule.selectors) assert.ok(selector.startsWith("#next-storefront-preview [data-storefront-section-id]"), "A public page without the preview id must never match");
    rule.walkDecls((declaration) => assert.ok(["cursor", "outline", "outline-offset"].includes(declaration.prop), "Inspection feedback must not affect layout or animate"));
  }
  assert.match(rules[1].selector, /:hover/);
  assert.match(rules[1].selector, /:focus-visible/);
  assert.match(rules[1].selector, /\.contents:hover > \*/, "Display-contents sections need feedback on their rendered child");
  assert.equal(rules[1].nodes.find((node) => node.prop === "outline").value, "2px solid var(--foreground)");
});

test("checks only the active root-layout CSS and ignores correct historical chunks", (t) => {
  const directory = buildFixture(t, ".unrelated{display:block}");
  writeFixture(directory, "static/chunks/retained-old-build.css", validCss);
  assert.throws(() => checkBuiltStyles(directory), /Incomplete storefront CSS/);
  writeFixture(directory, "static/chunks/active.css", validCss);
  const result = checkBuiltStyles(directory);
  assert.equal(result.buildId, "test-candidate");
  assert.equal(result.checks, requiredStyles.length);
  assert.deepEqual(result.stylesheets.map(({ file }) => file), ["static/chunks/active.css"]);
  assert.match(result.stylesheets[0].sha256, /^[a-f0-9]{64}$/);
});

test("fails closed for missing builds, manifest changes and invalid active paths", (t) => {
  assert.throws(() => checkBuiltStyles(temporaryDirectory(t)), /ENOENT/);
  const directory = buildFixture(t);
  writeFixture(directory, "server/app/(public)/page_client-reference-manifest.js", "globalThis.OTHER={};");
  assert.throws(() => checkBuiltStyles(directory), /Unrecognized active home manifest/);
  assert.throws(() => checkBuiltStyles(buildFixture(t, validCss, "static/../../outside.css")), /Invalid CSS path/);
  assert.throws(() => checkBuiltStyles(buildFixture(t, validCss, "static/chunks/missing.css")), /ENOENT/);
});

test("CLI exits nonzero even when a correct orphaned chunk exists", (t) => {
  const directory = buildFixture(t, "/* empty active stylesheet */");
  writeFixture(directory, "static/chunks/old.css", validCss);
  const result = spawnSync(process.execPath, [path.join(root, "scripts/check-storefront-styles.mjs"), "--build-dir", directory], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[styles\] FAIL: Incomplete storefront CSS/);
});

test("reproduces automatic discovery loss, then passes with explicit application sources", async (t) => {
  const fixture = compilationFixture(t);
  // Model the former automatic discovery configuration with a wrong scan base.
  // This reproduces a failure condition, not the unknown production build history.
  const automatic = fixture.css
    .replace('"tailwindcss" source(none)', '"tailwindcss"')
    .replace(/^@source (?:not )?"\.\.\/\*\*\/[^\n]+\n/gm, "");
  const before = await fixture.compile({ source: automatic });
  assert.throws(() => checkCss(before), /Incomplete storefront CSS/);
  for (const className of ["lg:hidden", "md:text-4xl", "grid-cols-2", "aspect-498/665", "aspect-[1.97/1]"]) {
    assert.ok(!before.includes(escapeClass(className)), `Legacy wrong-base build unexpectedly generated ${className}`);
  }
  const after = await fixture.compile();
  assert.equal(checkCss(after), requiredStyles.length);
  assert.equal(await fixture.compile({ base: fixture.project }), after, "Explicit discovery must not depend on the scan base");
  assert.equal(checkCss(await fixture.compile({ optimize: false })), requiredStyles.length, "Also accept actual nested Tailwind output");
});

test("explicit sources survive ignored build locations without scanning checks or local duplicate copies", async (t) => {
  const fixture = compilationFixture(t);
  writeFixture(fixture.project, ".gitignore", "src/\nnode_modules/\n");
  mkdirSync(path.join(fixture.project, ".git"));
  writeFixture(fixture.project, "src/components/nested/Runtime.tsx", 'export const className = "z-[987652]";');
  writeFixture(fixture.project, "src/components/nested/Runtime 2.tsx", 'export const className = "z-[987653]";');
  writeFixture(fixture.project, "scripts/test.mjs", 'export const className = "z-[987654]";');
  const css = await fixture.compile({ base: fixture.project });
  assert.equal(checkCss(css), requiredStyles.length);
  assert.ok(css.includes(escapeClass("z-[987652]")), "Nested application source must be scanned");
  assert.ok(!css.includes(escapeClass("z-[987653]")), "Local duplicate copies must be ignored without deleting them");
  assert.ok(!css.includes(escapeClass("z-[987654]")), "Checks must not supply candidates to their own gate");
});

test("source-only releases survive an ancestor ignore-all rule without Git metadata or safelisted utilities", async (t) => {
  const fixture = compilationFixture(t);
  const projectIgnore = readFileSync(path.join(root, ".gitignore"), "utf8");
  // Exact Linux staging condition: the host has an ancestor .gitignore with '*'
  // and the recoverable effective-source export deliberately contains no .git.
  writeFixture(path.dirname(fixture.project), ".gitignore", "*\n!.gitignore\n");
  assert.equal(existsSync(path.join(fixture.project, ".git")), false);
  writeFixture(fixture.project, "src/components/nested/Runtime.tsx", 'export const className = "z-[987655]";');
  writeFixture(fixture.project, "src/components/nested/Runtime 2.tsx", 'export const className = "z-[987656]";');
  writeFixture(fixture.project, "scripts/check.mjs", 'export const className = "z-[987657]";');

  const previousIgnore = projectIgnore.replace(/^!\/src\/(?:\*\*\/)?\r?\n/gm, "");
  writeFixture(fixture.project, ".gitignore", previousIgnore);
  const before = await fixture.compile();
  assert.throws(() => checkCss(before), /Incomplete storefront CSS/);
  assert.ok(!before.includes(escapeClass("z-[987655]")));

  writeFixture(fixture.project, ".gitignore", projectIgnore);
  const after = await fixture.compile();
  assert.equal(checkCss(after), requiredStyles.length);
  assert.ok(after.includes(escapeClass("z-[987655]")), "New nested application classes must be discovered, not safelisted");
  assert.ok(!after.includes(escapeClass("z-[987656]")), "User duplicate sources remain excluded");
  assert.ok(!after.includes(escapeClass("z-[987657]")), "The gate cannot provide its own candidates");
  assert.equal(existsSync(path.join(fixture.project, ".git")), false, "No fake Git boundary is created");
});
