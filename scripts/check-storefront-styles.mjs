import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const homeManifest = "server/app/(public)/page_client-reference-manifest.js";
const normalize = (value) => value.replace(/\s+/g, "");
const escapeClass = (value) => `.${value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")}`;
const productSource = "src/components/home/ProductCarouselTheme.tsx";
const categorySource = "src/components/home/CategoryCarousel.tsx";

// These are existing application classes, not a safelist. Keep this file outside
// Tailwind's source paths so the check cannot generate the CSS it is checking.
export const requiredStyles = [
  { className: "lg:hidden", source: "src/components/layout/navbar/BottomNavbar.tsx", property: "display", values: ["none"], minWidth: 1024 },
  { className: "md:text-4xl", source: productSource, property: "font-size", values: ["2.25rem"], variable: "--text-4xl", minWidth: 768 },
  { className: "grid", source: productSource, property: "display", values: ["grid"] },
  { className: "grid-cols-2", source: productSource, property: "grid-template-columns", values: ["repeat(2,minmax(0,1fr))"] },
  { className: "md:grid-cols-3", source: productSource, property: "grid-template-columns", values: ["repeat(3,minmax(0,1fr))"], minWidth: 768 },
  { className: "lg:grid-cols-4", source: productSource, property: "grid-template-columns", values: ["repeat(4,minmax(0,1fr))"], minWidth: 1024 },
  { className: "xss:grid-cols-2", source: categorySource, property: "grid-template-columns", values: ["repeat(2,minmax(0,1fr))"], minWidth: 525 },
  { className: "sm:grid-cols-3", source: categorySource, property: "grid-template-columns", values: ["repeat(3,minmax(0,1fr))"], minWidth: 640 },
  { className: "aspect-498/665", source: categorySource, property: "aspect-ratio", values: ["498/665"] },
  { className: "aspect-[1.97/1]", source: "src/components/home/ImageCarousel.tsx", property: "aspect-ratio", values: ["1.97", "1.97/1"] },
];

function matchesValue(declaration, check, roots) {
  const value = normalize(declaration.value);
  if (check.values.includes(value)) return true;
  if (!check.variable || value !== `var(${check.variable})`) return false;

  // A variable reference without its real theme value is not a working rule.
  let defined = false;
  for (const root of roots) {
    root.walkDecls(check.variable, (candidate) => {
      if (candidate.parent.type === "rule" &&
          candidate.parent.selectors.some((selector) => [":root", ":host"].includes(selector)) &&
          check.values.includes(normalize(candidate.value))) defined = true;
    });
  }
  return defined;
}

function matchesContext(declaration, check) {
  const rules = [];
  const media = [];
  for (let parent = declaration.parent; parent; parent = parent.parent) {
    if (parent.type === "rule") rules.push(parent);
    if (parent.type === "atrule" && parent.name === "media") media.push(normalize(parent.params));
  }
  // Supports both flattened production output and Tailwind's nested media form.
  // A descendant or pseudo-class with a matching name must not satisfy a utility.
  if (rules.length !== 1 || !rules[0].selectors.includes(escapeClass(check.className))) return false;
  if (!check.minWidth) return media.length === 0;
  return media.length === 1 && [
    `(min-width:${check.minWidth}px)`,
    `(width>=${check.minWidth}px)`,
  ].includes(media[0]);
}

export function checkStylesheets(stylesheets) {
  if (stylesheets.length === 0) throw new Error("No active storefront stylesheets found.");
  const roots = stylesheets.map(({ css, file }) => postcss.parse(css, { from: file }));
  const missing = requiredStyles.filter((check) => !roots.some((root) => {
    let found = false;
    root.walkDecls(check.property, (declaration) => {
      if (matchesContext(declaration, check) && matchesValue(declaration, check, roots)) found = true;
    });
    return found;
  }));
  if (missing.length) {
    throw new Error(`Incomplete storefront CSS:\n${missing.map((check) =>
      `  ${check.className}: ${check.property}${check.minWidth ? ` at >= ${check.minWidth}px` : ""} (${check.source})`
    ).join("\n")}\nCheck application source discovery and the active build; do not safelist this test's classes.`);
  }
  return requiredStyles.length;
}

export function checkBuiltStyles(buildDirectory = path.join(projectRoot, ".next")) {
  const buildDir = path.resolve(buildDirectory);
  const buildId = readFileSync(path.join(buildDir, "BUILD_ID"), "utf8").trim();
  if (!buildId) throw new Error("Missing production build ID; run a complete Next build first.");

  for (const check of requiredStyles) {
    if (!readFileSync(path.join(projectRoot, check.source), "utf8").includes(check.className)) {
      throw new Error(`Style contract is out of date: ${check.className} is no longer in ${check.source}.`);
    }
  }

  // Parse the JSON assignment, never execute the generated JavaScript. Do not
  // glob static/chunks: old chunks may deliberately be retained during deploys.
  const manifestText = readFileSync(path.join(buildDir, homeManifest), "utf8");
  const assignment = manifestText.match(/__RSC_MANIFEST\["\/\(public\)\/page"\]\s*=\s*([\s\S]+)$/);
  if (!assignment) throw new Error(`Unrecognized active home manifest: ${homeManifest}`);
  const manifest = JSON.parse(assignment[1].trim().replace(/;$/, ""));
  const layoutEntries = Object.entries(manifest.entryCSSFiles ?? {}).filter(([entry]) =>
    /(?:^|\/)src\/app\/layout(?:\.[cm]?[jt]sx?)?$/.test(entry)
  );
  if (layoutEntries.length !== 1 || !Array.isArray(layoutEntries[0][1]) || !layoutEntries[0][1].length) {
    throw new Error("Active home manifest does not identify the shared root layout CSS.");
  }

  const files = [...new Set(layoutEntries[0][1].map((entry) => typeof entry === "string" ? entry : entry.path))];
  const stylesheets = files.map((file) => {
    if (typeof file !== "string" || !/^static\/.+\.css$/.test(file) || file.split("/").includes("..") || file.includes("\\")) {
      throw new Error(`Invalid CSS path in active home manifest: ${String(file)}`);
    }
    return { file, css: readFileSync(path.join(buildDir, file), "utf8") };
  });
  const checks = checkStylesheets(stylesheets);
  return {
    buildId,
    checks,
    stylesheets: stylesheets.map(({ file, css }) => ({
      file,
      bytes: Buffer.byteLength(css),
      sha256: createHash("sha256").update(css).digest("hex"),
    })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== "--build-dir")) {
      throw new Error("Usage: node scripts/check-storefront-styles.mjs [--build-dir path]");
    }
    const result = checkBuiltStyles(args[1]);
    console.log(`[styles] PASS: ${result.checks} real utility rules in active build ${result.buildId}`);
    for (const stylesheet of result.stylesheets) {
      console.log(`[styles] ${stylesheet.file}: ${stylesheet.bytes} bytes; sha256 ${stylesheet.sha256}`);
    }
  } catch (error) {
    console.error(`[styles] FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
