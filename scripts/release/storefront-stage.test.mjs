import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isolatedEnvironment, publicBuildConfig, stageSnapshot } from "./storefront-stage.mjs";
import { verifyTree } from "./storefront-release.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const publicSettings = { NEXT_PUBLIC_LANDLORD_HOST: "app.jectstore.com", NEXT_PUBLIC_LANDLORD_SCHEME: "https", NEXT_PUBLIC_BAGISTO_GRAPHQL_ENDPOINT: "/graphql", NEXT_PUBLIC_NEXT_AUTH_URL: "https://app.jectstore.com" };
function setup(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "jectstore-stage-test-")));
  t.after(() => { assert.match(root, /\/jectstore-stage-test-[^/]+$/); rmSync(root, { recursive: true, force: true }); });
  const snapshot = join(root, "snapshot"); const payload = join(root, "payload"); const parent = join(root, "releases");
  for (const path of [snapshot, payload, parent]) mkdirSync(join(path, "src"), { recursive: true });
  const put = (base, path, data) => { writeFileSync(join(base, path), data); chmodSync(join(base, path), 0o644); };
  put(snapshot, "src/app.ts", "original"); put(snapshot, "package-lock.json", "lock"); put(snapshot, "untracked-note.txt", "historical"); put(snapshot, "src/user 2.ts", "user");
  mkdirSync(join(snapshot, "src/components/customer/credentials"), { recursive: true });
  put(snapshot, "src/components/customer/credentials/index.tsx", "export const Credentials = () => null;");
  put(snapshot, ".env", "SYNTHETIC_ONLY=never-copy"); put(snapshot, "next-env.d.ts", "generated old");
  put(payload, "src/app.ts", "new"); put(payload, "src/added.ts", "added");
  const manifest = { schema_version: 1, files: [
    { path: "src/app.ts", action: "replace", before_sha256: sha("original"), after_sha256: sha("new"), mode: 0o644 },
    { path: "src/added.ts", action: "add", before_sha256: null, after_sha256: sha("added"), mode: 0o644 },
  ], guards: [{ path: "package-lock.json", action: "guard", before_sha256: sha("lock"), after_sha256: sha("lock"), mode: 0o644 }] };
  const manifestPath = join(root, "manifest.json"); put(root, "manifest.json", JSON.stringify(manifest));
  return { root, snapshot, payload, parent, manifest, manifestPath, put };
}
test("stage creates a private new release preserving historical source and leaves snapshot untouched", (t) => {
  const f = setup(t); const result = stageSnapshot(f.snapshot, f.payload, f.manifestPath, f.parent);
  assert.equal(result.pass, true); assert.equal(result.live_service_changed, false);
  assert.equal(verifyTree(result.source, f.manifest, "after").pass, true);
  assert.equal(verifyTree(f.snapshot, f.manifest, "before").pass, true);
  assert.equal(readFileSync(join(result.source, "src/user 2.ts"), "utf8"), "user");
  assert.equal(readFileSync(join(result.source, "untracked-note.txt"), "utf8"), "historical");
  assert.equal(readFileSync(join(result.source, "src/components/customer/credentials/index.tsx"), "utf8"), "export const Credentials = () => null;");
  assert.equal(existsSync(join(result.source, ".env")), false); assert.equal(existsSync(join(result.source, "next-env.d.ts")), false);
  assert.match(readFileSync(join(f.snapshot, ".env"), "utf8"), /never-copy/);
});
test("stage rejects source drift, payload collisions and source symlinks", (t) => {
  const f = setup(t); f.put(f.snapshot, "src/app.ts", "foreign edit");
  assert.throws(() => stageSnapshot(f.snapshot, f.payload, f.manifestPath, f.parent), /baseline/);
  f.put(f.snapshot, "src/app.ts", "original"); f.put(f.payload, "unexpected.txt", "extra");
  assert.throws(() => stageSnapshot(f.snapshot, f.payload, f.manifestPath, f.parent), /exactly/);
  rmSync(join(f.payload, "unexpected.txt")); symlinkSync(join(f.root, "missing"), join(f.snapshot, "linked-source"));
  assert.throws(() => stageSnapshot(f.snapshot, f.payload, f.manifestPath, f.parent), /symlink/);
});
test("public settings reject secrets and build cannot inherit ambient credentials or live endpoints", () => {
  assert.deepEqual(publicBuildConfig(publicSettings), publicSettings);
  for (const name of ["NEXTAUTH_SECRET", "NEXT_PUBLIC_NEXT_AUTH_SECRET", "NODE_OPTIONS", "BAGISTO_SERVER_ENDPOINT"]) assert.throws(() => publicBuildConfig({ ...publicSettings, [name]: "forbidden" }));
  assert.throws(() => publicBuildConfig({ ...publicSettings, NEXT_PUBLIC_BAGISTO_GRAPHQL_ENDPOINT: "https://app.jectstore.com/graphql" }));
  assert.throws(() => publicBuildConfig({ ...publicSettings, NEXT_PUBLIC_NEXT_AUTH_URL: "https://user:password@app.jectstore.com" }));
  const env = isolatedEnvironment(publicSettings, "/tmp/synthetic-work");
  assert.equal(env.BAGISTO_SERVER_ENDPOINT, "http://127.0.0.1:9"); assert.equal(env.STOREFRONT_BACKEND_ORIGIN, "http://127.0.0.1:9");
  assert.equal(env.STOREFRONT_EXPERIENCES_ENABLED, "false"); assert.equal(env.STOREFRONT_EXPERIENCE_HOSTS, "");
  assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.HOME, undefined); assert.equal(env.npm_config_userconfig, "/dev/null");
  assert.notEqual(env.npm_config_globalconfig, env.npm_config_userconfig, "npm rejects loading the same file as user and global config");
  assert.equal(env.npm_config_globalconfig, "/tmp/synthetic-work/empty-npm-globalrc");
});
