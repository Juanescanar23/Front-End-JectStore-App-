import { readFileSync, statSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createHash } from "node:crypto";

// Real local Laravel + Nginx + built Next integration, never synthetic upstreams.
// Defaults to GET only. Authentication and rejected writes require explicit flags.
// --existing-draft-preview may call findOrCreate: use ONLY after the QA owner has
// created the draft in the UI. No valid select/save/publish/rollback is sent.
const hosts = ["beauty-oct26a.localhost", "fashion-oct26a.localhost"];
const options = new Map(process.argv.slice(2).map((argument) => {
  const match = /^--([a-z-]+)(?:=(.+))?$/.exec(argument);
  if (!match) throw new Error("Invalid local QA option");
  return [match[1], match[2] ?? true];
}));
const allowedOptions = ["credentials", "graphql-key", "authenticate", "negative-actions", "existing-draft-preview", "host"];
if ([...options.keys()].some((key) => !allowedOptions.includes(key))) throw new Error("Unknown local QA option");
const selectedHosts = options.has("host") ? [options.get("host")] : hosts;
if (selectedHosts.some((host) => !hosts.includes(host))) throw new Error("Only isolated QA hosts are permitted");
let checks = 0;
class QaFailure extends Error {}
const check = (value, label) => { if (!value) throw new QaFailure(label); checks++; };
const privateFile = (path) => {
  check(typeof path === "string" && path.startsWith("/tmp/experience-qa-oct26a/"), "Private QA file must belong to this fixture");
  const info = statSync(path);
  check(info.isFile() && (info.mode & 0o077) === 0, "Private QA file permissions must exclude other users");
  return readFileSync(path, "utf8").trim();
};
const graphqlKey = options.has("graphql-key") ? privateFile(options.get("graphql-key")) : "";
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function cookiesFrom(headers, jar, host) {
  for (const cookie of headers["set-cookie"] || []) {
    const domain = /;\s*Domain=([^;]+)/i.exec(cookie)?.[1].replace(/^\./, "").toLowerCase();
    check(!domain || host === domain || host.endsWith(`.${domain}`), "A response cookie must belong to the QA hostname");
    check(!/;\s*Secure(?:;|$)/i.test(cookie), "HTTP QA cannot use Secure cookies that the browser would discard");
    const first = cookie.split(";", 1)[0];
    const split = first.indexOf("=");
    if (split > 0) jar.set(first.slice(0, split), first.slice(split + 1));
  }
}
function request(host, path, { jar = new Map(), method = "GET", data, csrf, cookieOverride, headers = {} } = {}) {
  check(hosts.includes(host) && path.startsWith("/") && !path.startsWith("//"), "Request must stay within an isolated QA host");
  const body = data === undefined ? undefined : JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port: 8089, path, method, timeout: 20000, headers: {
      Host: `${host}:8089`, Accept: "application/json, text/html", Cookie: cookieOverride ?? [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
      ...(body === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }),
      ...(csrf ? { "X-CSRF-TOKEN": csrf } : {}), ...headers,
    } }, (response) => {
      const chunks = []; let size = 0;
      response.on("data", (chunk) => { size += chunk.length; if (size > 4_194_304) response.destroy(new QaFailure("Local response exceeds the bounded QA limit")); else chunks.push(chunk); });
      response.on("error", reject);
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8"); let json;
        try { json = JSON.parse(text); } catch { /* HTML is inspected without executing it. */ }
        try { if (cookieOverride === undefined) cookiesFrom(response.headers, jar, host); }
        catch (error) { reject(error); return; }
        resolve({ status: response.statusCode, headers: response.headers, text, json });
      });
    });
    req.on("timeout", () => req.destroy(new QaFailure("Local request timed out")));
    req.on("error", reject); req.end(body);
  });
}
function csrfFrom(html) {
  for (const tag of html.match(/<(?:input|meta)\b[^>]*>/gi) || []) {
    const attributes = Object.fromEntries([...tag.matchAll(/\b(name|value|content)=["']([^"']*)["']/gi)].map((item) => [item[1].toLowerCase(), item[2]]));
    if (attributes.name === "_token") return attributes.value;
    if (attributes.name === "csrf-token") return attributes.content;
  }
  throw new QaFailure("Login response must contain a CSRF token");
}
const statePath = (channel) => `/admin/storefront-editor/experiences/state?channel=${encodeURIComponent(channel)}`;
const rejected = (response) => [401, 403, 404, 409, 419].includes(response.status) || response.status === 302 && String(response.headers.location).includes("/admin/login");

async function run() {
  if (options.has("negative-actions") || options.has("existing-draft-preview")) check(options.has("authenticate"), "Protected checks require explicit authentication mode");
  const credentials = options.has("authenticate") ? JSON.parse(privateFile(options.get("credentials"))) : null;
  if (credentials) check(typeof credentials.email === "string" && typeof credentials.password === "string", "QA credentials must contain email and password");
  for (const host of selectedHosts) {
    const jar = new Map();
    const publicResponse = await request(host, "/api/storefront/experience");
    check(publicResponse.status === 200 && publicResponse.json?.data?.schema_version === 1, `${host}: real published experience must return200`);
    const published = publicResponse.json.data;
    check(/^[A-Z]{3}$/.test(published.currency), `${host}: channel currency required`);
    const query = "{ getDefaultChannel { id name baseCurrency { code } defaultLocale { code } } }";
    const catalog = await request(host, `/graphql?query=${encodeURIComponent(query)}`, { headers: graphqlKey ? { "X-STOREFRONT-KEY": graphqlKey } : {} });
    check(catalog.status === 200 && !catalog.json?.errors?.length && catalog.json?.data?.getDefaultChannel?.baseCurrency?.code === published.currency, `${host}: real public GraphQL must match channel currency`);
    const catalogSpoof = await request(host, `/graphql?query=${encodeURIComponent(query)}`, { headers: {
      ...(graphqlKey ? { "X-STOREFRONT-KEY": graphqlKey } : {}),
      "x-tenant-host": hosts.find((other) => other !== host), "x-forwarded-host": hosts.find((other) => other !== host),
    } });
    check(catalogSpoof.status === 200 && fingerprint(catalogSpoof.json?.data) === fingerprint(catalog.json.data), `${host}: public tenant hint headers must not change GraphQL ownership`);
    const home = await request(host, "/", { jar });
    check(home.status === 200 && home.text.includes("<html"), `${host}: real storefront must render`);
    check(!home.text.includes("No pudimos cargar esta versión") && !home.text.includes("portada del tenant todavía no esté personalizada"), `${host}: a generic unavailable/fallback page is not a passing storefront`);
    check(jar.has("jectstore_experience"), `${host}: real runtime must issue the base pin`);
    const spoofed = await request(host, "/api/storefront/experience", { headers: { "x-forwarded-host": hosts.find((other) => other !== host), "x-jectstore-experience-pin": "forged" } });
    check(rejected(spoofed) || spoofed.status === 200 && fingerprint(spoofed.json) === fingerprint(publicResponse.json), `${host}: unverified public selection must be rejected or ignored`);
    const unauthenticated = await request(host, statePath(published.channel.code));
    check(rejected(unauthenticated), `${host}: editor state requires tenant authority`);
    if (!credentials) { console.log(`${host}: public read-only checks PASS (${published.engine}, ${published.currency}).`); continue; }

    const login = await request(host, "/admin/login", { jar });
    check(login.status === 200, `${host}: QA login form required`);
    const csrf = csrfFrom(login.text);
    const authenticated = await request(host, "/admin/login", { jar, method: "POST", csrf, data: credentials });
    check(authenticated.status === 302, `${host}: QA authentication must redirect`);
    const state = await request(host, statePath(published.channel.code), { jar });
    check(state.status === 200 && Number.isInteger(state.json?.data?.version), `${host}: authenticated tenant state/version required`);
    const originalState = state.json.data;
    const otherHost = hosts.find((other) => other !== host);
    const replay = await request(otherHost, statePath(published.channel.code), { cookieOverride: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") });
    check(rejected(replay), `${host}: admin session must not authorize another tenant`);

    if (options.has("negative-actions")) {
      const selection = `/admin/storefront-editor/experiences/select?channel=${encodeURIComponent(published.channel.code)}`;
      const noCsrf = await request(host, selection, { jar, method: "POST", data: { base_key: "__invalid_qa_base__", expected_version: -1 } });
      check(noCsrf.status === 419, `${host}: selection must reject missing CSRF before any write`);
      const stale = await request(host, selection, { jar, method: "POST", csrf, data: { base_key: originalState.selected_base_key, expected_version: originalState.version + 1_000_000 } });
      check(stale.status === 409, `${host}: selection must reject an incorrect expected version`);
      const after = await request(host, statePath(published.channel.code), { jar });
      check(after.status === 200 && fingerprint(after.json.data) === fingerprint(originalState), `${host}: rejected actions must not alter selection/version/publication`);
    }

    if (options.has("existing-draft-preview")) {
      check(originalState.selected_base_key === "next-current", `${host}: preview gate expects the existing Next draft selected by the QA owner`);
      const stateUrl = `/admin/storefront-editor/next/state?channel=${encodeURIComponent(published.channel.code)}&locale=${encodeURIComponent(published.locale)}`;
      const editor = await request(host, stateUrl, { jar });
      check(editor.status === 200 && typeof editor.json?.preview_url === "string", `${host}: existing draft must expose an authorized preview URL`);
      const previewUrl = editor.json.preview_url;
      check(previewUrl.startsWith("/__storefront-next-preview?"), `${host}: preview must use its fixed Next route`);
      const preview = await request(host, previewUrl, { jar });
      check(preview.status === 200 && preview.text.includes("next-storefront-preview"), `${host}: signed preview must render the actual Next components`);
      check(String(preview.headers["cache-control"]).includes("no-store") && String(preview.headers["x-robots-tag"]).includes("noindex") && preview.headers["x-frame-options"] === "SAMEORIGIN", `${host}: preview must be private, unindexed and same-origin framed`);
      const forged = new URL(previewUrl, "http://fixture.local"); forged.searchParams.set("signature", "0".repeat(64));
      const tampered = await request(host, `${forged.pathname}${forged.search}`, { jar });
      check(tampered.status >= 400 && !tampered.text.includes("next-storefront-preview"), `${host}: forged preview signature must not expose a document`);
      const foreign = await request(otherHost, previewUrl, { cookieOverride: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") });
      check(foreign.status >= 400 && !foreign.text.includes("next-storefront-preview"), `${host}: signed preview must bind its tenant host`);
      const after = await request(host, stateUrl, { jar });
      check(after.status === 200 && fingerprint(after.json.page) === fingerprint(editor.json.page), `${host}: preview reads must not change the existing draft`);
    }
    const afterPublic = await request(host, "/api/storefront/experience");
    check(fingerprint(afterPublic.json) === fingerprint(publicResponse.json), `${host}: checks must preserve the published release`);
    console.log(`${host}: real tenant authentication/authority checks PASS; content unchanged.`);
  }
  console.log(`Real Laravel/Nginx/Next HTTP PASS: ${checks} assertions; no valid editor mutation or publication sent.`);
}
run().catch((error) => {
  // Never print response bodies, credentials, cookies, signed URLs or raw errors.
  console.error(`Real local HTTP FAIL: ${error instanceof QaFailure ? error.message : error?.code || error?.name || "runtime"}`);
  process.exitCode = 1;
});
