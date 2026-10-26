import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { chmodSync, closeSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inventoryTree, validateManifest, verifyOutsidePatch, verifyTree } from "./storefront-release.mjs";

// Local operator only: no SSH, service/ingress mutation, checkout replacement,
// publication, production probes, deletion, or automatic rollout/rollback.
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const save = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const derived = new Set([".git", ".next", "node_modules", "next-env.d.ts"]);
const publicNames = new Set(["NEXT_PUBLIC_LANDLORD_HOST", "NEXT_PUBLIC_LANDLORD_SCHEME", "NEXT_PUBLIC_NEXT_AUTH_URL", "NEXT_PUBLIC_BAGISTO_GRAPHQL_ENDPOINT", "NEXT_PUBLIC_BAGISTO_STOREFRONT_KEY", "NEXT_PUBLIC_DEFAULT_TENANT_PLAN", "BAGISTO_SESSION", "SITE_NAME"]);
function sanitizedInventory(root) {
  const inventory = inventoryTree(root);
  const omitted = [];
  for (const [path, value] of Object.entries(inventory.files)) {
    if (value.kind === "protected-metadata-only" || path.split("/").some((part) => derived.has(part))) { omitted.push(path); delete inventory.files[path]; }
    else assert(value.kind === "file", `Source symlink/special entry requires separate review: ${path}`);
  }
  return { inventory, omitted };
}
export function publicBuildConfig(value) {
  assert(value && Object.getPrototypeOf(value) === Object.prototype, "Public build config must be a JSON object");
  for (const [name, content] of Object.entries(value)) {
    assert(publicNames.has(name) && typeof content === "string" && content.length < 2048 && !/[\r\n\0]/.test(content), `Unsupported public build setting: ${name}`);
  }
  assert(/^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(value.NEXT_PUBLIC_LANDLORD_HOST || ""), "A reviewed production landlord hostname is required");
  assert(value.NEXT_PUBLIC_LANDLORD_SCHEME === "https", "Public production scheme must be https");
  assert(value.NEXT_PUBLIC_BAGISTO_GRAPHQL_ENDPOINT === "/graphql", "Use the reviewed same-origin /graphql public endpoint");
  let url; try { url = new URL(value.NEXT_PUBLIC_NEXT_AUTH_URL); } catch { /* rejected below */ }
  assert(url && url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/" && !url.port, "A reviewed public HTTPS storefront/auth origin is required");
  return { ...value };
}
export function isolatedEnvironment(settings, work) {
  return { ...publicBuildConfig(settings), PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    BAGISTO_SERVER_ENDPOINT: "http://127.0.0.1:9", STOREFRONT_BACKEND_ORIGIN: "http://127.0.0.1:9", STOREFRONT_NATIVE_ORIGIN: "http://127.0.0.1:9",
    STOREFRONT_EXPERIENCES_ENABLED: "false", STOREFRONT_EXPERIENCE_HOSTS: "", STOREFRONT_REALTIME_MODE: "false", NEXTAUTH_URL: "http://127.0.0.1:9", NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
    npm_config_userconfig: "/dev/null", npm_config_globalconfig: join(work, "empty-npm-globalrc"), npm_config_cache: join(work, "npm-cache"), npm_config_registry: "https://registry.npmjs.org", npm_config_update_notifier: "false" };
}
export function stageSnapshot(snapshotPath, payloadPath, manifestPath, parentPath) {
  const snapshot = realpathSync(snapshotPath); const payload = realpathSync(payloadPath); const parent = realpathSync(parentPath);
  assert(!["/", "/var/www", "/var/www/jectstore-front", "/var/www/jectstore-reseller-front"].includes(parent), "Choose a dedicated existing staging parent, never the live checkout");
  assert(!parent.startsWith(`${snapshot}/`) && parent !== snapshot && !parent.startsWith(`${payload}/`) && parent !== payload, "Staging parent cannot be inside its inputs");
  assert(snapshot !== "/var/www/jectstore-front", "Use a recoverable effective-source snapshot, not the live checkout");
  const manifest = validateManifest(json(manifestPath));
  assert(verifyTree(snapshot, manifest, "before").pass, "Snapshot baseline/absence/guard verification failed");
  assert(verifyTree(payload, manifest, "payload").pass, "Payload hash/mode verification failed");
  const payloadInventory = inventoryTree(payload); const paths = new Set(manifest.files.map((file) => file.path));
  assert(Object.keys(payloadInventory.files).length === paths.size && Object.entries(payloadInventory.files).every(([path, value]) => paths.has(path) && value.kind === "file"), "Payload must contain exactly the explicit regular files");
  const { inventory: before, omitted } = sanitizedInventory(snapshot);
  const work = mkdtempSync(join(parent, "storefront-stage-")); chmodSync(work, 0o700);
  const source = join(work, "source");
  cpSync(snapshot, source, { recursive: true, preserveTimestamps: true, filter: (path) => {
    const name = relative(snapshot, path);
    if (!name) return true;
    if (name.split("/").some((part) => derived.has(part) || part.endsWith(".tsbuildinfo"))) return false;
    return !omitted.some((skip) => name === skip || name.startsWith(`${skip}/`));
  } });
  for (const file of manifest.files) {
    const target = join(source, file.path); mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(payload, file.path), target); chmodSync(target, file.mode);
  }
  assert(verifyTree(source, manifest, "after").pass, "Staged candidate verification failed");
  assert(verifyOutsidePatch(before, sanitizedInventory(source).inventory, manifest).pass, "Unrelated source changed during stage");
  assert(JSON.stringify(sanitizedInventory(snapshot).inventory.files) === JSON.stringify(before.files), "Snapshot changed while staging");
  save(join(work, "source-before.json"), before);
  save(join(work, "stage.json"), { schema_version: 1, root: work, source, snapshot, manifest_sha256: sha(readFileSync(manifestPath)), omitted_configuration: omitted, excluded_generated: [...derived, "*.tsbuildinfo"], source_changes_outside_patch: [] });
  return { pass: true, stage: work, source, payload_files: paths.size, omitted_configuration_paths: omitted, live_service_changed: false };
}
function state(workPath, manifestPath) {
  const work = realpathSync(workPath); const value = json(join(work, "stage.json"));
  assert(value.schema_version === 1 && value.root === work && value.source === join(work, "source") && basename(work).startsWith("storefront-stage-") && value.manifest_sha256 === sha(readFileSync(manifestPath)), "Staging receipt/manifest mismatch");
  const manifest = validateManifest(json(manifestPath));
  assert(verifyTree(value.source, manifest, "after").pass, "Staged bytes or dependency guard changed");
  const current = sanitizedInventory(value.source);
  assert(current.omitted.every((path) => path === "next-env.d.ts"), "Do not place private configuration in staged source");
  assert(verifyOutsidePatch(json(join(work, "source-before.json")), current.inventory, manifest).pass, "Unrelated staged source changed");
  return { work, source: value.source, manifest };
}
function linuxRuntime() { assert(process.version === "v20.19.6" && process.platform === "linux", "Build/test/launch requires Linux Node20.19.6; never reuse macOS artifacts"); }
async function run(command, args, cwd, env, log) {
  const fd = openSync(log, "wx", 0o600);
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  const code = await new Promise((resolveCode, reject) => { child.once("error", reject); child.once("exit", resolveCode); });
  assert(code === 0, `Step failed; private log: ${log}`);
}
async function unusedPort(port) {
  const server = createServer();
  await new Promise((resolveReady, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolveReady); });
  await new Promise((resolveClosed) => server.close(resolveClosed));
}
function matchingConfig(work, configPath) {
  const receipt = json(join(work, "build.json"));
  assert(receipt.public_config_sha256 === sha(readFileSync(configPath)) && receipt.runtime === process.version && receipt.platform === process.platform, "Build/public-config/runtime mismatch");
  assert(receipt.build_id === readFileSync(join(work, "source/.next/BUILD_ID"), "utf8").trim(), "Build identity changed");
  return receipt;
}
async function build(workPath, manifestPath, configPath) {
  linuxRuntime(); const { work, source } = state(workPath, manifestPath);
  assert(!existsSync(join(source, "node_modules")) && !existsSync(join(source, ".next")), "Build needs a fresh stage; previous partial builds are retained, never deleted");
  const env = isolatedEnvironment(json(configPath), work);
  // npm refuses one filename loaded in both scopes. Keep the global scope
  // explicitly empty and private instead of inheriting the server's npm config.
  writeFileSync(env.npm_config_globalconfig, "", { mode: 0o600, flag: "wx" });
  await run("npm", ["ci", "--ignore-scripts", "--include=dev", "--no-audit", "--no-fund"], source, env, join(work, "install.log"));
  await run("npm", ["run", "build"], source, env, join(work, "build.log"));
  // next-env.d.ts is generated by Next and deliberately excluded from source comparison.
  const after = inventoryTree(source); delete after.files["next-env.d.ts"];
  assert(verifyTree(source, validateManifest(json(manifestPath)), "after").pass && verifyOutsidePatch(json(join(work, "source-before.json")), after, json(manifestPath)).pass, "Build changed non-generated source");
  save(join(work, "build.json"), { runtime: process.version, platform: process.platform, build_id: readFileSync(join(source, ".next/BUILD_ID"), "utf8").trim(), public_config_sha256: sha(readFileSync(configPath)), no_real_backend: true });
  return { pass: true, stage: work, log: join(work, "build.log") };
}
async function testStage(workPath, manifestPath, configPath) {
  linuxRuntime(); const { work, source } = state(workPath, manifestPath); matchingConfig(work, configPath);
  const env = isolatedEnvironment(json(configPath), work);
  // The effective production tree may not contain this unchanged historical
  // smoke. Ship its exact source as an operator asset, never as an app overlay.
  const cacheSmoke = fileURLToPath(new URL("../tests/storefront-cache-http-smoke.mjs", import.meta.url));
  assert(existsSync(cacheSmoke), "Operator package is missing the historical cache HTTP fixture");
  const logs = mkdtempSync(join(work, "checks-")); chmodSync(logs, 0o700);
  const tests = ["tests/storefront-revalidation.test.mjs", "tests/guest-cart-envelope.test.mjs", "scripts/tests/frontend-compat.contract.test.mjs", "scripts/tests/navbar-layout.contract.test.mjs", "scripts/tests/storefront-styles.test.mjs", "scripts/tests/storefront-experience.test.mjs", "scripts/tests/tenant-session.test.mjs"];
  await run(process.execPath, ["--test", ...tests], source, env, join(logs, "unit.log"));
  await unusedPort(3005); await unusedPort(3006);
  for (const name of ["tenant-session", "storefront-experience", "revalidation", "storefront-cache"]) {
    const script = name === "storefront-cache" ? cacheSmoke : `scripts/tests/${name}-http-smoke.mjs`;
    await run(process.execPath, [script], source, env, join(logs, `${name}-http.log`));
  }
  state(work, manifestPath);
  save(join(work, "tests.json"), { pass: true, log_directory: logs, fixture_upstreams_only: true, real_backend_and_CUA_separate: true, build_id: readFileSync(join(source, ".next/BUILD_ID"), "utf8").trim() });
  return { pass: true, stage: work, log_directory: logs, real_backend_and_CUA: "Require separate owner approval; not performed by this operator" };
}
function origin(value) {
  let parsed; try { parsed = new URL(value); } catch { /* rejected below */ }
  assert(parsed && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname === "/" && (parsed.protocol === "https:" || parsed.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)), "Fixed runtime origin must be HTTPS or loopback HTTP, without path/credentials");
  return parsed.origin;
}
async function launch(workPath, manifestPath, configPath, rawPort) {
  linuxRuntime(); const { work, source } = state(workPath, manifestPath); const built = matchingConfig(work, configPath);
  assert(json(join(work, "tests.json")).build_id === built.build_id, "Fixture gates must pass for this build");
  const port = Number(rawPort); assert(Number.isInteger(port) && port > 1024 && port < 65536 && ![3000, 3001, 3008].includes(port), "Choose an unused private port, not production/reseller/QA"); await unusedPort(port);
  const env = isolatedEnvironment(json(configPath), work);
  for (const name of ["NEXTAUTH_SECRET", "STOREFRONT_REVALIDATE_SIGNING_KEY", "STOREFRONT_RUNTIME_SIGNING_KEY"]) { assert(typeof process.env[name] === "string" && process.env[name].length >= 32, `Supply ${name} privately in the operator environment`); env[name] = process.env[name]; }
  env.BAGISTO_SERVER_ENDPOINT = origin(process.env.BAGISTO_SERVER_ENDPOINT);
  env.STOREFRONT_BACKEND_ORIGIN = origin(process.env.STOREFRONT_BACKEND_ORIGIN);
  env.STOREFRONT_NATIVE_ORIGIN = origin(process.env.STOREFRONT_NATIVE_ORIGIN);
  env.NEXTAUTH_URL = origin(process.env.NEXTAUTH_URL);
  const replay = process.env.STOREFRONT_REVALIDATE_REPLAY_DIR;
  assert(replay && realpathSync(replay) === replay && !replay.startsWith(`${work}/`) && lstatSync(replay).isDirectory() && (lstatSync(replay).mode & 0o077) === 0, "Use a canonical private persistent replay directory outside the release");
  env.STOREFRONT_REVALIDATE_REPLAY_DIR = replay;
  assert(/^[a-z0-9.,:-]+$/.test(process.env.STOREFRONT_REVALIDATE_ALLOWED_HOSTS || ""), "Supply reviewed receiver host allowlist"); env.STOREFRONT_REVALIDATE_ALLOWED_HOSTS = process.env.STOREFRONT_REVALIDATE_ALLOWED_HOSTS;
  const fd = openSync(join(work, `loopback-${port}.log`), "wx", 0o600);
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: source, env, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
  console.log(JSON.stringify({ loopback: `127.0.0.1:${port}`, child_pid: child.pid, experiences_enabled: false, pilot_hosts: [], foreground: true, service_changed: false }));
  await new Promise((resolveExit, reject) => { child.once("error", reject); child.once("exit", resolveExit); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2); let result;
    if (command === "stage" && args.length === 4) result = stageSnapshot(...args);
    else if (command === "verify" && args.length === 2) { state(...args); result = { pass: true }; }
    else if (command === "build" && args.length === 3) result = await build(...args);
    else if (command === "test" && args.length === 3) result = await testStage(...args);
    else if (command === "launch" && args.length === 4) await launch(...args);
    else throw new Error("Usage: stage SNAPSHOT PAYLOAD MANIFEST PARENT | verify STAGE MANIFEST | build|test STAGE MANIFEST PUBLIC_JSON | launch STAGE MANIFEST PUBLIC_JSON PORT");
    if (result) console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
