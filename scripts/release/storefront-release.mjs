import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = /^[a-f0-9]{64}$/;
const excludedDirectory = new Set([".git", ".next", "node_modules"]);
const protectedName = (name) => name === ".env" || name.startsWith(".env.")
  || /(?:^|[-_.])(?:credentials|secrets?)(?:[-_.]|$)/i.test(name)
  || /\.(?:key|pem|p12|pfx|crt|cer|log)$/i.test(name);

export function releasePath(path) {
  if (typeof path !== "string" || !path || path.startsWith("-") || isAbsolute(path) || !/^[A-Za-z0-9_./%()[\]-]+$/.test(path)
    || path.split("/").some((part) => !part || [".", ".."].includes(part) || excludedDirectory.has(part) || protectedName(part))
    || / 2\.[^/]+$/.test(path)) throw new Error("Unsafe release path");
  return path;
}

function inspect(root, path) {
  releasePath(path);
  const base = realpathSync(root);
  let cursor = base;
  for (const part of path.split("/")) {
    cursor = join(cursor, part);
    if (!existsSync(cursor)) {
      // lstat still detects broken symlinks, which existsSync deliberately follows.
      try { if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink denied: ${path}`); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      return { exists: false, sha256: null };
    }
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink denied: ${path}`);
  }
  const stat = lstatSync(cursor);
  if (!stat.isFile() || !cursor.startsWith(`${base}${sep}`)) throw new Error(`Non-regular release file: ${path}`);
  return { exists: true, sha256: hash(readFileSync(cursor)), bytes: stat.size, mode: stat.mode & 0o777 };
}

export function createManifest(root, spec, production) {
  if (spec.schema_version !== 1 || !/^[a-f0-9]{40}$/.test(spec.baseline)) throw new Error("Invalid explicit release specification");
  if (production.root !== "/var/www/jectstore-front" || !/^[a-f0-9]{40}$/.test(production.head)) throw new Error("Invalid production preflight");
  const seen = new Set();
  const entry = (path, guard) => {
    releasePath(path);
    if (seen.has(path)) throw new Error(`Duplicate release path: ${path}`);
    seen.add(path);
    const observed = production.files.find((file) => file.path === path);
    if (!observed || observed.symlink || observed.exists && !observed.regular) throw new Error(`Unverified production path: ${path}`);
    let baseline;
    try { baseline = execFileSync("git", ["show", `${spec.baseline}:${path}`], { cwd: root, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }); }
    catch { baseline = null; }
    const before = baseline ? hash(baseline) : null;
    if ((observed.sha256 ?? null) !== before) throw new Error(`Production differs from baseline: ${path}`);
    const candidate = inspect(root, path);
    if (!candidate.exists) throw new Error(`Candidate file missing: ${path}`);
    if (guard && candidate.sha256 !== before) throw new Error(`Unchanged dependency drift: ${path}`);
    if (!guard && candidate.sha256 === before) throw new Error(`Unchanged file in patch: ${path}`);
    return { path, action: guard ? "guard" : before ? "replace" : "add", before_sha256: before, after_sha256: candidate.sha256, bytes: candidate.bytes, mode: candidate.mode };
  };
  return {
    schema_version: 1, baseline: spec.baseline, production_head: production.head,
    production_observed_at: production.captured_at, deployment_authorized: false,
    files: [...spec.files].sort().map((path) => entry(path, false)),
    guards: [...spec.guards].sort().map((path) => entry(path, true)),
  };
}

export function validateManifest(manifest) {
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length || !Array.isArray(manifest.guards)) throw new Error("Invalid release manifest");
  const seen = new Set();
  for (const file of [...manifest.files, ...manifest.guards]) {
    releasePath(file.path);
    if (seen.has(file.path) || !digest.test(file.after_sha256) || file.before_sha256 !== null && !digest.test(file.before_sha256)
      || !["replace", "add", "guard"].includes(file.action) || !Number.isInteger(file.mode) || file.mode < 0 || file.mode > 0o777
      || file.action === "add" && file.before_sha256 !== null || file.action !== "add" && file.before_sha256 === null
      || file.action === "guard" && file.before_sha256 !== file.after_sha256) throw new Error("Invalid manifest entry");
    seen.add(file.path);
  }
  if (manifest.files.some((file) => file.action === "guard") || manifest.guards.some((file) => file.action !== "guard")) throw new Error("Invalid manifest scope");
  return manifest;
}

export function verifyTree(root, manifest, phase) {
  validateManifest(manifest);
  if (!["before", "after", "payload"].includes(phase)) throw new Error("Invalid verification phase");
  const errors = [];
  const files = phase === "payload" ? manifest.files : [...manifest.files, ...manifest.guards];
  for (const file of files) {
    try {
      const actual = inspect(root, file.path);
      const expected = phase === "before" ? file.before_sha256 : file.after_sha256;
      if (actual.sha256 !== expected || expected === null && actual.exists) errors.push({ path: file.path, reason: "hash-or-presence-mismatch" });
      if (phase !== "before" && actual.exists && actual.mode !== file.mode) errors.push({ path: file.path, reason: "mode-mismatch" });
    } catch { errors.push({ path: file.path, reason: "unsafe-or-unreadable" }); }
  }
  return { pass: errors.length === 0, phase, checked: files.length, errors };
}

/** Hashes source only. Protected configuration is metadata-only, never read. */
export function inventoryTree(root) {
  const base = realpathSync(root); const files = {};
  const walk = (directory, relative = "") => {
    for (const name of readdirSync(directory).sort()) {
      if (excludedDirectory.has(name) || name.endsWith(".tsbuildinfo")) continue;
      const path = relative ? `${relative}/${name}` : name;
      const full = join(directory, name); const stat = lstatSync(full);
      // This exact, reviewed directory contains the customer credentials UI,
      // not credential values. Its children retain the normal secret-name gate.
      const knownSourceDirectory = stat.isDirectory() && path === "src/components/customer/credentials";
      if (protectedName(name) && !knownSourceDirectory) { files[path] = { kind: "protected-metadata-only", mode: stat.mode & 0o777, bytes: stat.size }; continue; }
      if (stat.isSymbolicLink()) { files[path] = { kind: "symlink", link_sha256: hash(readlinkSync(full)), mode: stat.mode & 0o777 }; continue; }
      if (stat.isDirectory()) walk(full, path);
      else if (stat.isFile()) files[path] = { kind: "file", sha256: hash(readFileSync(full)), mode: stat.mode & 0o777, bytes: stat.size };
      else throw new Error(`Unsupported source entry: ${path}`);
    }
  };
  walk(base);
  return { schema_version: 1, root: base, excluded: [...excludedDirectory, "*.tsbuildinfo"], protected_values_read: false, files };
}

export function verifyOutsidePatch(before, after, manifest) {
  validateManifest(manifest);
  const changed = new Set(manifest.files.map((file) => file.path));
  const errors = [];
  for (const path of new Set([...Object.keys(before.files), ...Object.keys(after.files)])) {
    if (!changed.has(path) && JSON.stringify(before.files[path]) !== JSON.stringify(after.files[path])) errors.push(path);
  }
  return { pass: errors.length === 0, changed_outside_patch: errors, protected_configuration: "metadata only; preserve/backup values separately without disclosure" };
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2); let result;
    if (command === "manifest" && args.length === 3) result = createManifest(args[0], readJson(args[1]), readJson(args[2]));
    else if (command === "verify" && args.length === 3) result = verifyTree(args[1], readJson(args[2]), args[0]);
    else if (command === "inventory" && args.length === 1) result = inventoryTree(args[0]);
    else if (command === "preserved" && args.length === 3) result = verifyOutsidePatch(readJson(args[0]), readJson(args[1]), readJson(args[2]));
    else if (command === "paths" && args.length === 1) { console.log(validateManifest(readJson(args[0])).files.map((file) => file.path).join("\n")); process.exit(0); }
    else throw new Error("Usage: manifest ROOT SPEC PREFLIGHT | verify before|after|payload ROOT MANIFEST | inventory ROOT | preserved BEFORE AFTER MANIFEST | paths MANIFEST");
    console.log(JSON.stringify(result, null, 2));
    if (result.pass === false) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
