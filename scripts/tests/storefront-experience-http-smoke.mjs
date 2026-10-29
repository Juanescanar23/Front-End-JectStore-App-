import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { encode as encodeJwt } from "next-auth/jwt";
import { experience } from "./fixtures/storefront-experience.mjs";

// Real built Next HTTP/cookie/rewrite integration. All upstreams are local fixtures;
// PHP authorization has separate backend tests, and browser QA belongs to CUA.
const key = randomBytes(32).toString("hex");
const authSecret = randomBytes(32).toString("hex");
const ingressIp = "203.0.113.42";
const run = randomBytes(5).toString("hex");
const host = `next-${run}.jectstore.test`;
const otherHost = `other-${run}.jectstore.test`;
const brokenHost = `broken-${run}.jectstore.test`;
const legacyHost = `legacy-${run}.jectstore.test`;
const usdHost = `usd-${run}.jectstore.test`;
const unlistedHost = `outside-${run}.jectstore.test`;
const active = new Map([[host, "next"], [otherHost, "visual"], [brokenHost, "broken"], [legacyHost, "legacy"], [usdHost, "next"], [unlistedHost, "legacy"]]);
let latestNextRevision = 11;
let publishBetweenProxyAndRsc = false;
const counts = { experience: 0, preview: 0, native: 0 };
const nativeCalls = [];
const backendCalls = [];
let signedGraphqlCalls = 0;
let nextChild;
let output = "";
let assertions = 0;

function signedPin(targetHost, reference = 11, base = "next-current", lifetime = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ v: 1, host: targetHost, base_key: base, published_revision_id: reference, issued_at: now, expires_at: now + lifetime })).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(`jectstore.experience.pin.v1\n${payload}`).digest("hex")}`;
}
function verifyPin(value, targetHost) {
  const [encoded, signature] = String(value).split(".");
  assert.equal(signature, createHmac("sha256", key).update(`jectstore.experience.pin.v1\n${encoded}`).digest("hex"));
  const pin = JSON.parse(Buffer.from(encoded, "base64url").toString());
  assert.equal(pin.host, targetHost);
  assert.ok(pin.expires_at > Date.now() / 1000);
  return pin;
}
function json(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}
function guestToken(targetHost) {
  return createHmac("sha256", key).update(`fixture-guest:${targetHost}:cart-123`).digest("hex");
}
function guestCookie(targetHost) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64");
  const payload = Buffer.from(encodeURIComponent(JSON.stringify({ sessionToken: guestToken(targetHost), cartId: 123, isGuest: true }))).toString("base64");
  return encodeURIComponent(`${header}.${payload}.guest`);
}
function nextSnapshot(targetHost, reference = latestNextRevision) {
  const value = experience({ published_revision_id: reference, version: reference - 10, currency: targetHost === usdHost ? "USD" : "MXN" });
  value.data.document.sections.push({ id: "products-grid", type: "product_carousel", visible: true, settings: { title: "Disponibilidad del catálogo", description: "Fixture local", layout: "grid", filters: { limit: 4 } } });
  if (reference !== 11) value.data.document.sections[1].settings.title = `Productos editoriales v${reference - 10}`;
  return value;
}
function previewQuery(targetHost = host, valid = true) {
  const query = new URLSearchParams({ tenant: "fixture", host: targetHost, channel: "1", locale: "es", page: "7", version: "2", actor: "1", session: "fixture-session-hmac", expires: String(Math.floor(Date.now() / 1000) + 300) });
  const signature = createHmac("sha256", key).update(`/api/storefront/next-preview?${query}`).digest("hex");
  query.set("signature", valid ? signature : "0".repeat(64));
  query.set("_editor_preview", "local-preview-nonce");
  return query.toString();
}

const provider = createServer(async (req, res) => {
  const url = new URL(req.url, "http://fixture.local");
  const targetHost = String((url.pathname === "/graphql" ? req.headers["x-tenant-host"] : null) || req.headers.host || "").replace(/:\d+$/, "");
  if (!active.has(targetHost)) { console.error(`Local fixture rejected host ${targetHost} at ${url.pathname}`); return json(res, { error: "unknown tenant" }, 404); }
  if (url.pathname === "/api/storefront/experience") {
    counts.experience++;
    backendCalls.push({ host: targetHost, headers: req.headers });
    const signed = req.headers["x-jectstore-experience-pin"];
    if (signed) {
      let pin;
      try { pin = verifyPin(signed, targetHost); } catch { return json(res, { error: "invalid pin" }, 409); }
      if (pin.base_key === "next-current" && [null, 11, 12, 13].includes(pin.published_revision_id)) {
        const legacy = active.get(targetHost) === "legacy" && pin.published_revision_id === null;
        if (pin.mode === "request" && pin.published_revision_id === null && !legacy) return json(res, { error: "checkpoint raced" }, 409);
        const reference = pin.mode === "request" ? pin.published_revision_id : latestNextRevision;
        const result = legacy ? experience({ version: 0, published_revision_id: null, document: null }) : nextSnapshot(targetHost, reference);
        if (pin.mode !== "request" && pin.published_revision_id !== result.data.published_revision_id) result.data.continuity_advanced_from = pin.published_revision_id;
        if (pin.mode !== "request" && publishBetweenProxyAndRsc) { latestNextRevision = 13; publishBetweenProxyAndRsc = false; }
        return json(res, result);
      }
      if (pin.base_key === "visual-debut" && pin.published_revision_id === 22) return json(res, experience({ engine: "visual", base_key: "visual-debut", published_revision_id: 22, document: null }));
      return json(res, { error: "revision not allowed" }, 410);
    }
    const guest = req.headers["x-jectstore-legacy-guest-token"];
    if (guest) return guest === guestToken(targetHost) ? json(res, nextSnapshot(targetHost)) : json(res, { error: "invalid guest proof" }, 403);
    if (active.get(targetHost) === "broken") return json(res, { data: { engine: "next" } });
    if (active.get(targetHost) === "visual") return json(res, experience({ engine: "visual", base_key: "visual-debut", published_revision_id: 22, document: null }));
    return json(res, active.get(targetHost) === "legacy" ? experience({ version: 0, published_revision_id: null, document: null }) : nextSnapshot(targetHost));
  }
  if (url.pathname === "/api/storefront/next-preview") {
    counts.preview++;
    const signature = url.searchParams.get("signature");
    url.searchParams.delete("signature"); url.searchParams.delete("_editor_preview");
    const expected = createHmac("sha256", key).update(`${url.pathname}?${url.searchParams}`).digest("hex");
    if (signature !== expected || url.searchParams.get("host") !== targetHost || !String(req.headers.cookie).includes("fixture_admin=1")) return json(res, { error: "preview forbidden" }, 403);
    const result = experience({ preview: true, version: 2, published_revision_id: null });
    result.data.document.sections[1].settings.title = "Vista previa editorial autorizada";
    return json(res, result);
  }
  let text = "";
  for await (const chunk of req) { text += chunk; if (text.length > 65536) { req.destroy(); return; } }
  const [payload, signature] = String(req.headers["x-jectstore-client-context"] || "").split(".");
  assert.equal(signature, createHmac("sha256", key).update(`jectstore.client-context.v1\n${payload}`).digest("hex"));
  const context = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.equal(context.host, targetHost); assert.equal(context.ip, ingressIp);
  assert.equal(context.method, "POST"); assert.equal(context.path, "/graphql");
  assert.equal(context.body_sha256, createHash("sha256").update(text).digest("hex"));
  assert.equal(context.expires_at - context.issued_at, 60); assert.ok(context.expires_at > Date.now() / 1000);
  assert.equal(req.headers["x-jectstore-client-ip"], undefined);
  signedGraphqlCalls++;
  const title = `Local runtime ${targetHost}`;
  const products = [1, 2, 3, 4].map((id) => ({ __typename: "Product", id: String(id), sku: `fixture-${id}`, name: `Producto local ${id}`, urlKey: `fixture-${id}`, type: "simple", price: "100", specialPrice: null, isSaleable: [true, false, null, undefined][id - 1], baseImageUrl: "/fixture-product.svg", images: [], cacheBaseImage: [], cacheGalleryImages: [], categories: [] }));
  const categories = [2, 3].map((id) => ({ id: String(id), name: `Categoría local ${id}`, slug: `fixture-${id}`, position: id, logoUrl: "/fixture-category.svg", children: [] }));
  const catalog = { data: products, paginatorInfo: { total: products.length, count: products.length, currentPage: 1, lastPage: 1 } };
  json(res, { data: {
    getDefaultChannel: { id: "1", name: title, description: title, logoUrl: "/fixture-logo.svg", faviconUrl: null, defaultLocale: { code: "es" }, baseCurrency: { code: "MXN", symbol: "$" }, homeSeo: { metaTitle: title, metaDescription: title } },
    homeCategories: categories, products: catalog, allProducts: catalog,
    themeCustomization: [{ id: "legacy-banner", type: "image_carousel", name: "Banner legacy", status: true, sortOrder: 1, translations: [{ id: "1", localeCode: "es", options: { images: [{ image: "/fixture-banner.svg", title: "Banner LEGACY existente", link: "" }] } }] }],
  } });
});
const native = createServer(async (req, res) => {
  let body = ""; for await (const chunk of req) body += chunk;
  counts.native++;
  const nativeHost = req.headers["x-jectstore-native-host"];
  const pin = verifyPin(req.headers["x-jectstore-experience-pin"], new URL(`http://${nativeHost}`).hostname);
  nativeCalls.push({ method: req.method, path: req.url, host: nativeHost, pin, cookie: req.headers.cookie, rsc: req.headers.rsc, ip: req.headers["x-jectstore-client-ip"], body });
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<!doctype html><title>Visual nativo local</title><main>NATIVE_VISUAL_FIXTURE</main>");
});
await Promise.all([new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve)), new Promise((resolve) => native.listen(0, "127.0.0.1", resolve))]);
const providerPort = provider.address().port;
const nativePort = native.address().port;
async function freePort() {
  const server = createServer(); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const value = server.address().port; await new Promise((resolve) => server.close(resolve)); return value;
}
async function start(enabled = true) {
  const port = await freePort(); output = "";
  nextChild = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", STOREFRONT_REALTIME_MODE: "false",
      BAGISTO_SERVER_ENDPOINT: `http://127.0.0.1:${providerPort}`, STOREFRONT_BACKEND_ORIGIN: `http://127.0.0.1:${providerPort}`, STOREFRONT_NATIVE_ORIGIN: `http://127.0.0.1:${nativePort}`,
      STOREFRONT_EXPERIENCES_ENABLED: String(enabled), STOREFRONT_RUNTIME_SIGNING_KEY: key, NEXTAUTH_SECRET: authSecret,
      STOREFRONT_EXPERIENCE_HOSTS: [host, otherHost, brokenHost, legacyHost, usdHost].join(","),
      NEXT_PUBLIC_LANDLORD_HOST: "127.0.0.1", NEXT_PUBLIC_LANDLORD_SCHEME: "http", NEXTAUTH_URL: `http://127.0.0.1:${port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  nextChild.stdout.on("data", (chunk) => { output += chunk; }); nextChild.stderr.on("data", (chunk) => { output += chunk; });
  for (let i = 0; i < 100 && !output.includes("Ready in"); i++) {
    if (nextChild.exitCode !== null) throw new Error("Next exited before readiness.");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(output.includes("Ready in"));
  return port;
}
async function stop() {
  if (!nextChild) return;
  nextChild.kill("SIGTERM");
  if (nextChild.exitCode === null) await new Promise((resolve) => nextChild.once("exit", resolve));
  nextChild = undefined;
}
function request(port, targetHost, path = "/", options = {}) {
  const outgoing = new Headers({ Host: targetHost, ...options.headers });
  // The trusted ingress replaces a public IP hint before Next receives it.
  outgoing.set("X-Jectstore-Client-IP", ingressIp);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port, path, method: options.method || "GET", headers: Object.fromEntries(outgoing), timeout: 20000 }, (res) => {
      let text = ""; res.setEncoding("utf8"); res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(new Error("Local runtime fixture timed out"))); req.end(options.body);
  });
}
const cookieFrom = (response) => (response.headers["set-cookie"] || []).find((value) => value.startsWith("jectstore_experience="))?.split(";")[0];
const check = (condition, message) => { assert.ok(condition, message); assertions++; };
async function checkScriptPolicy(port, html, surface) {
  const buildConfig = JSON.parse(readFileSync(".next/required-server-files.json", "utf8")).config;
  assert.equal(buildConfig.crossOrigin, "anonymous");
  assert.equal(buildConfig.deploymentId, "jectstore-cors-v1-20261028");
  const manifest = JSON.parse(readFileSync(".next/build-manifest.json", "utf8"));
  const bootstrapPaths = new Set([...manifest.rootMainFiles, ...manifest.polyfillFiles].map(path => `/_next/${path}`));
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(match => match[0]).filter(tag => /\bsrc="\/_next\/static\//i.test(tag));
  const preloads = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]).filter(tag => /\brel="(?:preload|modulepreload)"/i.test(tag) && /\bas="script"/i.test(tag) && /\bhref="\/_next\/static\//i.test(tag));
  // An empty crossorigin attribute is React's serialization of anonymous mode.
  // Next 16.4.3 can omit it on unused layer scripts. Those must use the explicit
  // response-policy version, never an unversioned no-cors CDN cache entry.
  const resources = [...scripts, ...preloads].map(tag => {
    const url = new URL(tag.match(/\b(?:src|href)="([^"]+)"/i)[1].replaceAll("&amp;", "&"), "http://fixture.local");
    const anonymous = /\bcrossorigin="(?:anonymous)?"/i.test(tag);
    assert.ok(!/\bcrossorigin="use-credentials"/i.test(tag), "Public assets must not include credentials");
    assert.equal(url.searchParams.get("dpl"), buildConfig.deploymentId, "All static script URLs must pin the built response policy");
    if (bootstrapPaths.has(url.pathname) || preloads.includes(tag)) assert.ok(anonymous, "Bootstrap and script preloads still require anonymous CORS");
    return { url, anonymous };
  });
  for (const { url, anonymous } of resources) {
    const asset = await request(port, host, url.pathname + url.search, { headers: { ...(anonymous ? { origin: "null" } : {}), "sec-fetch-site": "cross-site", "sec-fetch-mode": anonymous ? "cors" : "no-cors", "sec-fetch-dest": "script" } });
    assert.equal(asset.status, 200);
    assert.equal(asset.headers["cross-origin-resource-policy"], "cross-origin");
    assert.equal(asset.headers["access-control-allow-origin"], "*");
    assert.equal(asset.headers["access-control-allow-credentials"], undefined);
    assert.match(asset.headers["cache-control"], /immutable/);
    const file = resolve(".next", url.pathname.slice("/_next/".length));
    assert.ok(file.startsWith(resolve(".next/static") + "/"));
    assert.equal(createHash("sha256").update(asset.text).digest("hex"), createHash("sha256").update(readFileSync(file)).digest("hex"), "Every response must match its current built asset, not a historical chunk");
  }
  check(scripts.length > 0 && preloads.length > 0, `${surface}: real bootstrap and layer assets must be present`);
  console.log(`${surface} script policy PASS: ${scripts.length} scripts, ${preloads.length} preloads; anonymous or versioned, current headers and exact bodies.`);
}

try {
  let port = await start();
  const before = counts.experience;
  const published = await request(port, host, "/", { headers: { "x-tenant-host": otherHost, "x-forwarded-host": otherHost, "x-jectstore-native-host": otherHost, "x-jectstore-client-context": "browser-forgery", "x-jectstore-client-ip": "198.51.100.99" } });
  check(published.status === 200 && published.text.includes("Productos editoriales"), `Published Next document must render (status=${published.status}, backend=${JSON.stringify(backendCalls.map((call) => call.host))}, native=${JSON.stringify(nativeCalls)}, html=${published.text.slice(0, 700)})`);
  check(counts.experience - before === 2, "Proxy plus ONE memoized RSC loader; shell/home must share revision");
  check(backendCalls.slice(-2).every((call) => call.host === host), "Spoofed tenant headers must not scope data");
  check(signedGraphqlCalls > 0, "Real SSR sends verified context even when the browser supplied an invented proof");
  const cookie = cookieFrom(published);
  check(Boolean(cookie) && /HttpOnly/i.test(published.headers["set-cookie"].join(";")), "Server issues HttpOnly engine pin");
  check(!Object.keys(published.headers).some((name) => name.startsWith("x-jectstore-")), "Internal selection must not leak to response headers");
  await checkScriptPolicy(port, published.text, "Public storefront");
  const assetPaths = [...new Set([...published.text.matchAll(/(?:href|src)="(\/_next\/static\/[^" ]+)"/g)].map((match) => match[1]))];
  for (const suffix of [".css", ".js"]) {
    const path = assetPaths.find((value) => new URL(value, "http://fixture.local").pathname.endsWith(suffix));
    assert.ok(path, "The built page must reference its actual static assets");
    const asset = await request(port, host, path, { headers: { origin: "null", "sec-fetch-site": "cross-site" } });
    check(asset.status === 200 && asset.headers["cross-origin-resource-policy"] === "cross-origin" && asset.headers["access-control-allow-origin"] === "*" && !asset.headers["access-control-allow-credentials"], "Opaque preview can load a public static asset without credentials");
  }
  check(!published.headers["access-control-allow-origin"], "Public asset CORS must not apply to the storefront document");
  check(published.text.includes('data-currency="MXN"') && !published.text.includes('data-currency="USD"'), "Next uses channel MXN without relabeling amounts USD");
  for (const id of [1, 2, 3, 4]) {
    const buttons = [...published.text.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]).filter((button) => button.includes(`aria-label="fixture-${id}"`));
    check(buttons.length === 2 && buttons.every((button) => button.includes(`aria-disabled="${id !== 1}"`)), `Both actual card CTAs preserve catalog salability for product ${id}: ${JSON.stringify(buttons)}`);
  }
  const usd = await request(port, usdHost);
  check(usd.text.includes('data-currency="USD"'), "A different channel retains its authoritative USD currency");
  latestNextRevision = 12;
  publishBetweenProxyAndRsc = true;
  const changed = await request(port, host, "/", { headers: { cookie } });
  check(changed.text.includes("Productos editoriales v2") && !changed.text.includes("Productos editoriales v3"), "Same-base publication advances the session but a concurrent publish cannot change its request revision");
  check(verifyPin(cookieFrom(changed).split("=")[1], host).published_revision_id === 12, "Authorized same-base advance updates the session cookie");
  const changedAgain = await request(port, host, "/", { headers: { cookie: cookieFrom(changed) } });
  check(changedAgain.text.includes("Productos editoriales v3"), "Next request observes the next authorized publication");
  active.set(host, "visual");
  const retained = await request(port, host, "/", { headers: { cookie } });
  check(retained.text.includes("Productos editoriales") && !retained.text.includes("NATIVE_VISUAL_FIXTURE"), "Existing Next session stays on its authorized release");
  const visual = await request(port, host, "/category/item?q=one%20two", { headers: { cookie: "fixture_cookie=preserved", rsc: "1" } });
  check(visual.status === 200 && visual.text.includes("NATIVE_VISUAL_FIXTURE"), "Fresh visitor receives native Visual");
  check(nativeCalls.at(-1).host === host && nativeCalls.at(-1).path === "/category/item?q=one%20two" && nativeCalls.at(-1).rsc === "1", "Native rewrite preserves tenant, path, query and RSC");
  check(nativeCalls.at(-1).ip === ingressIp, "Native private hop retains the ingress-owned client IP");
  check(nativeCalls.at(-1).pin.mode === "request" && nativeCalls.at(-1).pin.published_revision_id === 22 && nativeCalls.at(-1).pin.expires_at - nativeCalls.at(-1).pin.issued_at === 60, "Native resolver receives the authenticated exact request revision, not just plaintext hints");
  const visualWithPort = await request(port, `${host}:8089`, "/category/item?q=port", { headers: { "x-forwarded-host": `${otherHost}:9999`, "x-tenant-host": otherHost, "x-jectstore-native-host": `${otherHost}:9999` } });
  check(visualWithPort.status === 200 && nativeCalls.at(-1).host === `${host}:8089`, "Native URL generation receives the real validated ingress authority including its port, never spoofed forwarding headers");
  check(nativeCalls.at(-1).pin.host === host && verifyPin(cookieFrom(visualWithPort).split("=")[1], host).host === host, "Tenant and signed pin identities remain canonical hostnames without a transport port");
  const visualHttpsPort = await request(port, `${host}:443`);
  check(visualHttpsPort.status === 200 && nativeCalls.at(-1).host === `${host}:443`, "Explicit HTTPS port authority survives without changing the fixed native destination");
  active.set(host, "next");
  const retainedVisual = await request(port, host, "/", { headers: { cookie: cookieFrom(visual) } });
  check(retainedVisual.text.includes("NATIVE_VISUAL_FIXTURE") && nativeCalls.at(-1).pin.base_key === "visual-debut", "Existing Visual session stays on its own published base after Next activates");
  active.set(host, "visual");
  await request(port, host, "/checkout/cart/add", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: "fixture_cookie=preserved" }, body: "sku=fixture&quantity=1" });
  check(nativeCalls.at(-1).method === "POST" && nativeCalls.at(-1).body === "sku=fixture&quantity=1" && nativeCalls.at(-1).cookie.includes("fixture_cookie=preserved"), "Native form method/body/cookie preserved, not translated");
  const jwt = await encodeJwt({ token: { sub: "fixture-customer", accessToken: "local-fixture-only", tenant_host: host, tenant_session_version: 1 }, secret: authSecret, maxAge: 3600 });
  const authenticated = await request(port, host, "/", { headers: { cookie: `next-auth.session-token=${jwt}` } });
  check(authenticated.text.includes("Productos editoriales"), "Verified host-bound NextAuth session resolves its Next checkpoint");
  const unboundJwt = await encodeJwt({ token: { sub: "legacy-customer", accessToken: "local-fixture-only" }, secret: authSecret, maxAge: 3600 });
  check((await request(port, host, "/", { headers: { cookie: `next-auth.session-token=${unboundJwt}` } })).text.includes("NATIVE_VISUAL_FIXTURE"), "Unbound legacy JWT cannot force Next continuity; reauthentication is required");
  check((await request(port, otherHost, "/", { headers: { cookie: `next-auth.session-token=${jwt}` } })).text.includes("NATIVE_VISUAL_FIXTURE"), "Authentic JWT from another tenant cannot force Next continuity");
  const guest = await request(port, host, "/", { headers: { cookie: `guest_cart_token=${guestCookie(host)}` } });
  check(guest.text.includes("Productos editoriales"), "Backend-verified legacy guest proof resolves Next checkpoint");
  check((await request(port, host, "/", { headers: { cookie: "guest_cart_token=forged" } })).status === 503, "Forged guest token cannot authorize a release");
  check((await request(port, host, "/", { headers: { cookie: `jectstore_experience=${signedPin(host, 999)}` } })).status === 503, "Revoked/unowned reference fails closed");
  check((await request(port, brokenHost)).status === 503, "Invalid backend envelope cannot silently fall back");
  const legacy = await request(port, legacyHost);
  check(legacy.status === 200 && legacy.text.includes("Banner LEGACY existente"), "Explicit null document preserves legacy GraphQL");
  active.set(legacyHost, "visual");
  const upgraded = await request(port, legacyHost, "/", { headers: { cookie: cookieFrom(legacy) } });
  check(upgraded.text.includes("Productos editoriales"), "Null legacy pin upgrades to saved checkpoint after activation");
  const preview = await request(port, host, `/__storefront-next-preview?${previewQuery()}`, { headers: { cookie: "fixture_admin=1" } });
  check(preview.status === 200 && preview.text.includes("Vista previa editorial autorizada"), "Authorized preview renders the same actual Next components");
  await checkScriptPolicy(port, preview.text, "Signed preview");
  check(preview.headers["x-frame-options"] === "SAMEORIGIN" && /noindex/.test(preview.headers["x-robots-tag"] || "") && /no-store/.test(preview.headers["cache-control"] || ""), "Preview overrides DENY and cannot be indexed/cached");
  check(!preview.headers["access-control-allow-origin"] && !preview.headers["access-control-allow-credentials"], "Private preview must not inherit static-asset CORS");
  check(preview.text.includes('data-storefront-section-id="products-1"') && preview.text.includes("next-storefront-preview"), "Preview contains the section-selection surface");
  check(!cookieFrom(preview), "Preview must not change the public engine pin");
  const badPreview = await request(port, host, `/__storefront-next-preview?${previewQuery(host, false)}`, { headers: { cookie: "fixture_admin=1" } });
  check(badPreview.status >= 400 || !badPreview.text.includes("Vista previa editorial autorizada"), "Invalid preview never renders the candidate");
  const beforeReserved = counts.experience;
  const nativeBeforeReserved = counts.native;
  const providers = await request(port, host, "/api/auth/providers");
  check(providers.status === 200 && providers.text.includes("credentials"), "Next auth API retains its existing owner");
  check(!providers.headers["access-control-allow-origin"] && !providers.headers["access-control-allow-credentials"], "API responses must not inherit static-asset CORS");
  await request(port, host, "/api/cart/createGuestToken");
  check(counts.experience === beforeReserved && counts.native === nativeBeforeReserved, "Reserved APIs do not consult the experience router");
  const notPilot = await request(port, unlistedHost);
  check(notPilot.status === 200 && notPilot.text.includes("Banner LEGACY existente") && !cookieFrom(notPilot) && counts.experience === beforeReserved, "Host outside the exact pilot list remains legacy without backend lookup or pin");
  await stop();
  port = await start(false);
  const beforeDisabled = counts.experience;
  const disabled = await request(port, brokenHost);
  check(disabled.status === 200 && disabled.text.includes("Banner LEGACY existente") && counts.experience === beforeDisabled, "Feature off retains legacy and makes zero experience requests");
  check((await request(port, host, `/__storefront-next-preview?${previewQuery()}`)).status === 404, "Preview is unavailable while the feature is off");
  console.log(`Storefront experience real HTTP PASS: ${assertions} checks; Next/Visual, fixed upstream, revision pin, legacy auth/guest, signed preview, ownership and feature-off.`);
} catch (error) {
  console.error(output.slice(-2500));
  throw error;
} finally {
  await stop();
  await Promise.all([new Promise((resolve) => provider.close(resolve)), new Promise((resolve) => native.close(resolve))]);
}
