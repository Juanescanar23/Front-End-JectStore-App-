import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releasePath, validateManifest, verifyTree, inventoryTree, verifyOutsidePatch } from "./storefront-release.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "jectstore-release-test-"));
  t.after(() => { assert.match(root, /\/jectstore-release-test-[^/]+$/); rmSync(root, { recursive: true, force: true }); });
  const source = join(root, "production-copy"); mkdirSync(join(source, "src"), { recursive: true });
  for (const [path, data] of [["src/app.ts", "old"], ["package-lock.json", "locked"], ["user 2.ts", "historical user source"], ["untracked-note.txt", "keep me"], [".env", "SYNTHETIC_ONLY=not-a-secret"]]) writeFileSync(join(source, path), data, { mode: 0o600 });
  const manifest = { schema_version: 1, files: [
    { path: "src/app.ts", action: "replace", before_sha256: sha("old"), after_sha256: sha("new"), bytes: 3, mode: 0o600 },
    { path: "src/added.ts", action: "add", before_sha256: null, after_sha256: sha("added"), bytes: 5, mode: 0o600 },
  ], guards: [{ path: "package-lock.json", action: "guard", before_sha256: sha("locked"), after_sha256: sha("locked"), bytes: 6, mode: 0o600 }] };
  return { root, source, manifest };
}

test("release manifest rejects secrets, user duplicates, traversal, duplicated paths and invalid hashes", () => {
  for (const path of [".env", ".env.production", "secrets.json", "credentials.json", "key.pem", "../src/app.ts", "/var/www/file", "src/app 2.ts", ".next/cache/x", "node_modules/x", "src\\file.ts", "-C", "src/$(command).ts"]) assert.throws(() => releasePath(path));
  const file = { path: "src/a.ts", action: "add", before_sha256: null, after_sha256: "0".repeat(64), mode: 0o644 };
  assert.throws(() => validateManifest({ schema_version: 1, files: [file, file], guards: [] }));
  assert.throws(() => validateManifest({ schema_version: 1, files: [{ ...file, after_sha256: "unknown" }], guards: [] }));
});

test("isolated overlay preserves historical/untracked source and original rollback bytes", (t) => {
  const { root, source, manifest } = fixture(t);
  assert.equal(verifyTree(source, manifest, "before").pass, true);
  const before = inventoryTree(source); const stage = join(root, "candidate-copy"); cpSync(source, stage, { recursive: true });
  writeFileSync(join(stage, "src/app.ts"), "new"); writeFileSync(join(stage, "src/added.ts"), "added", { mode: 0o600 });
  assert.equal(verifyTree(stage, manifest, "after").pass, true);
  assert.equal(verifyOutsidePatch(before, inventoryTree(stage), manifest).pass, true);
  assert.equal(verifyTree(source, manifest, "before").pass, true, "Original rollback source stays byte-identical");
  assert.equal(before.files[".env"].kind, "protected-metadata-only");
  assert.equal(before.files[".env"].sha256, undefined, "Configuration values were never read into the manifest");
  writeFileSync(join(stage, "untracked-note.txt"), "accidentally overwritten");
  assert.deepEqual(verifyOutsidePatch(before, inventoryTree(stage), manifest).changed_outside_patch, ["untracked-note.txt"]);
});

test("drift, unexpected new files, dependency changes and symlinks fail closed before release", (t) => {
  const { root, source, manifest } = fixture(t);
  writeFileSync(join(source, "src/app.ts"), "foreign edit");
  assert.equal(verifyTree(source, manifest, "before").pass, false);
  writeFileSync(join(source, "src/app.ts"), "old"); writeFileSync(join(source, "src/added.ts"), "preexisting collision");
  assert.equal(verifyTree(source, manifest, "before").pass, false);
  rmSync(join(source, "src/added.ts")); symlinkSync(join(root, "missing-target"), join(source, "src/added.ts"));
  assert.equal(verifyTree(source, manifest, "before").pass, false);
  rmSync(join(source, "src/added.ts")); writeFileSync(join(source, "package-lock.json"), "different dependencies");
  assert.equal(verifyTree(source, manifest, "before").pass, false);
});

test("inventory preserves the known credentials UI source directory but never classifies secret files as source", (t) => {
  const { source } = fixture(t);
  const ui = "src/components/customer/credentials";
  mkdirSync(join(source, ui), { recursive: true });
  writeFileSync(join(source, ui, "index.tsx"), "export const Credentials = () => null;");
  writeFileSync(join(source, ui, ".env"), "SYNTHETIC_ONLY=never-inventory");
  mkdirSync(join(source, "credentials"));
  writeFileSync(join(source, "credentials", "private.txt"), "SYNTHETIC_ONLY=never-inventory");
  const inventory = inventoryTree(source);
  assert.equal(inventory.files[`${ui}/index.tsx`]?.kind, "file");
  assert.equal(inventory.files[`${ui}/.env`]?.kind, "protected-metadata-only");
  assert.equal(inventory.files[`${ui}/.env`]?.sha256, undefined);
  assert.equal(inventory.files.credentials.kind, "protected-metadata-only");
  assert.equal(inventory.files["credentials/private.txt"], undefined);
});
