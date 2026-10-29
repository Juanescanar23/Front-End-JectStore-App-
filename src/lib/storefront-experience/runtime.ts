import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { parseNextStorefrontDocument, type NextStorefrontDocument } from "./document";

export const EXPERIENCE_COOKIE = "jectstore_experience";
export const EXPERIENCE_REQUEST_HEADER = "x-jectstore-request-selection";
export const PREVIEW_QUERY_HEADER = "x-jectstore-next-preview-query";
export const PIN_MAX_AGE = 86_400;
export const REQUEST_PIN_MAX_AGE = 60;
export const PREVIEW_PATH = "/__storefront-next-preview";
const PIN_CONTEXT = "jectstore.experience.pin.v1\n";
const MAX_RESPONSE_BYTES = 262_144;
const BASE_ENGINES = { "next-current": "next", "visual-debut": "visual" } as const;

export type ExperienceBase = keyof typeof BASE_ENGINES;
export type ExperiencePin = {
  v: 1;
  mode?: "session" | "request";
  host: string;
  base_key: ExperienceBase;
  published_revision_id: number | null;
  issued_at: number;
  expires_at: number;
};
export type StorefrontExperience = {
  schema_version: 1;
  engine: "next" | "visual";
  base_key: ExperienceBase;
  channel: { id: number; code: string };
  locale: string;
  currency: string;
  version: number;
  published_revision_id: number | null;
  document: NextStorefrontDocument | null;
  preview?: true;
  continuity_advanced_from?: number | null;
};

export class StorefrontExperienceError extends Error {
  constructor(public readonly code: string, public readonly status = 503) {
    super(`Storefront experience unavailable (${code}).`);
    this.name = "StorefrontExperienceError";
  }
}

export function experiencesEnabled(): boolean {
  return process.env.STOREFRONT_EXPERIENCES_ENABLED === "true";
}

export function isCentralExperienceHost(host: string): boolean {
  return host === canonicalExperienceHost(process.env.NEXT_PUBLIC_LANDLORD_HOST || "app.jectstore.com");
}

/** Eligibility is not tenant authority: the fixed backend must resolve every
 * registered domain before rendering or issuing a release pin. Pilot remains
 * the default; an empty/malformed list and unknown policies never mean all. */
export function experiencesEnabledForHost(host: string): boolean {
  if (!experiencesEnabled()) return false;
  try {
    if (canonicalExperienceHost(host) !== host || isIP(host) || isCentralExperienceHost(host)) return false;
  } catch { return false; }
  const policy = process.env.STOREFRONT_EXPERIENCE_HOST_POLICY || "pilot";
  if (policy === "backend-registered") return true;
  if (policy !== "pilot") return false;
  return (process.env.STOREFRONT_EXPERIENCE_HOSTS || "").split(",").some((entry) => {
    const candidate = entry.trim().toLowerCase();
    try { return candidate === canonicalExperienceHost(candidate) && candidate === host; }
    catch { return false; }
  });
}

/** Host is supplied by the trusted ingress, never by public forwarded headers. */
export function canonicalExperienceHost(value: string | null): string {
  if (!value || /[\s,@/?#\\]/.test(value)) throw new StorefrontExperienceError("host", 400);
  try {
    const parsed = new URL(`http://${value}`);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) throw new Error("host");
    return host;
  } catch {
    throw new StorefrontExperienceError("host", 400);
  }
}

/** Native URL generation needs the ingress authority, while identity/pins stay port-free. */
export function experienceRequestAuthority(value: string | null): string {
  const host = canonicalExperienceHost(value);
  const authority = /^([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?$/.exec(value ?? "");
  if (!authority) throw new StorefrontExperienceError("host", 400);
  const port = authority[2] === undefined ? null : Number(authority[2]);
  if (port !== null && (port < 1 || port > 65535)) throw new StorefrontExperienceError("host", 400);
  return port === null ? host : `${host}:${port}`;
}

export function runtimeSigningKey(): string {
  const key = process.env.STOREFRONT_RUNTIME_SIGNING_KEY || "";
  if (Buffer.byteLength(key, "utf8") < 32) throw new StorefrontExperienceError("signing-key");
  return key;
}

function mac(payload: string, key: string): string {
  return createHmac("sha256", key).update(PIN_CONTEXT + payload).digest("hex");
}

export function encodeExperiencePin(pin: ExperiencePin, key = runtimeSigningKey()): string {
  const encoded = Buffer.from(JSON.stringify(pin), "utf8").toString("base64url");
  return `${encoded}.${mac(encoded, key)}`;
}

export function decodeExperiencePin(value: string | undefined | null, host: string, key = runtimeSigningKey(), now = Math.floor(Date.now() / 1000)): ExperiencePin | null {
  if (!value || value.length > 2048) return null;
  const match = /^([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/.exec(value);
  if (!match) return null;
  const expected = Buffer.from(mac(match[1], key), "hex");
  const received = Buffer.from(match[2], "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const pin = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
    if (!pin || typeof pin !== "object" || Array.isArray(pin)
      || Object.keys(pin).some((name) => !["v", "mode", "host", "base_key", "published_revision_id", "issued_at", "expires_at"].includes(name))
      || pin.v !== 1 || pin.host !== host || canonicalExperienceHost(pin.host) !== pin.host
      || pin.mode !== undefined && !["session", "request"].includes(pin.mode)
      || !Object.hasOwn(BASE_ENGINES, pin.base_key)
      || !(pin.published_revision_id === null || Number.isSafeInteger(pin.published_revision_id) && pin.published_revision_id > 0)
      || pin.base_key === "visual-debut" && pin.published_revision_id === null
      || !Number.isSafeInteger(pin.issued_at) || !Number.isSafeInteger(pin.expires_at)
      || pin.issued_at > now + 30 || pin.issued_at < 0 || pin.expires_at <= now
      || pin.expires_at <= pin.issued_at || pin.expires_at - pin.issued_at > (pin.mode === "request" ? REQUEST_PIN_MAX_AGE : PIN_MAX_AGE)) return null;
    return pin as ExperiencePin;
  } catch {
    return null;
  }
}

export function pinForExperience(experience: StorefrontExperience, host: string, previous?: ExperiencePin | null, now = Math.floor(Date.now() / 1000)): ExperiencePin {
  if (previous && previous.base_key !== experience.base_key) throw new StorefrontExperienceError("pin-base-changed");
  if (previous && previous.published_revision_id !== experience.published_revision_id
    && (previous.mode === "request" || !Object.hasOwn(experience, "continuity_advanced_from") || experience.continuity_advanced_from !== previous.published_revision_id)) {
    throw new StorefrontExperienceError("pin-revision-changed");
  }
  return {
    v: 1, mode: "session", host, base_key: experience.base_key, published_revision_id: experience.published_revision_id,
    issued_at: previous?.issued_at ?? now, expires_at: previous?.expires_at ?? now + PIN_MAX_AGE,
  };
}

export function requestPinForExperience(experience: StorefrontExperience, host: string, now = Math.floor(Date.now() / 1000)): ExperiencePin {
  return { v: 1, mode: "request", host, base_key: experience.base_key, published_revision_id: experience.published_revision_id, issued_at: now, expires_at: now + REQUEST_PIN_MAX_AGE };
}

/** The browser cookie is an unsigned transport envelope, NOT authentication.
 * Only the inner token is sent to Laravel's tenant/cart cryptographic verifier.
 */
export function legacyGuestProof(cookie: string | undefined): string | undefined {
  if (!cookie) return undefined;
  if (cookie.length > 4096) throw new StorefrontExperienceError("guest-cookie", 400);
  try {
    const decoded = decodeURIComponent(cookie);
    const parts = decoded.split(".");
    let token = decoded;
    if (parts.length === 3) {
      const payload = JSON.parse(decodeURIComponent(Buffer.from(parts[1], "base64").toString("utf8")));
      token = payload?.sessionToken;
    }
    if (typeof token !== "string" || !token || token.length > 4096 || /[\s\u0000-\u001f]/.test(token)) throw new Error("token");
    return token;
  } catch { throw new StorefrontExperienceError("guest-cookie", 400); }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StorefrontExperienceError("response-shape");
  return value as Record<string, unknown>;
}

export function parseStorefrontExperience(value: unknown, preview = false): StorefrontExperience {
  const data = object(object(value).data);
  const channel = object(data.channel);
  if (data.schema_version !== 1 || !Object.hasOwn(BASE_ENGINES, String(data.base_key))
    || data.engine !== BASE_ENGINES[data.base_key as ExperienceBase]
    || !Number.isSafeInteger(channel.id) || Number(channel.id) < 1
    || typeof channel.code !== "string" || channel.code.length > 100
    || typeof data.locale !== "string" || !/^[A-Za-z]{2,8}(?:[_-][A-Za-z0-9]{2,8})*$/.test(data.locale)
    || typeof data.currency !== "string" || !/^[A-Z]{3}$/.test(data.currency)
    || !Number.isSafeInteger(data.version) || Number(data.version) < 0
    || !(data.published_revision_id === null || Number.isSafeInteger(data.published_revision_id) && Number(data.published_revision_id) > 0)
    || preview !== (data.preview === true)) throw new StorefrontExperienceError("response-contract");
  if (Object.hasOwn(data, "continuity_advanced_from") && !(data.continuity_advanced_from === null || Number.isSafeInteger(data.continuity_advanced_from) && Number(data.continuity_advanced_from) > 0)) throw new StorefrontExperienceError("continuity-contract");
  if (preview && (data.engine !== "next" || Number(data.version) < 1 || data.document === null)) throw new StorefrontExperienceError("preview-contract");
  if (!preview && data.published_revision_id === null && (data.engine !== "next" || data.version !== 0 || data.document !== null)) throw new StorefrontExperienceError("legacy-contract");
  if (data.engine === "visual" && data.document !== null) throw new StorefrontExperienceError("native-document");
  if (data.engine === "next" && data.published_revision_id !== null && data.document === null) throw new StorefrontExperienceError("missing-document");
  let document = null;
  if (data.document !== null) {
    try { document = parseNextStorefrontDocument(data.document); }
    catch { throw new StorefrontExperienceError("document-contract"); }
  }
  return { ...data, channel, document } as StorefrontExperience;
}

/** Configuration chooses the network destination. Request hosts only scope tenancy. */
export function configuredOrigin(kind: "backend" | "native"): URL {
  const explicit = kind === "backend" ? process.env.STOREFRONT_BACKEND_ORIGIN : process.env.STOREFRONT_NATIVE_ORIGIN;
  const raw = explicit || (kind === "backend" ? process.env.BAGISTO_SERVER_ENDPOINT : "");
  try {
    if (!raw || /[\s\\]/.test(raw)) throw new Error("origin");
    const url = new URL(raw);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash
      || !(url.protocol === "https:" || url.protocol === "http:" && loopback)
      || explicit && url.pathname !== "/") throw new Error("origin");
    return new URL(url.origin);
  } catch { throw new StorefrontExperienceError(`${kind}-origin`); }
}

export function safeRequestHeaders(incoming: Headers, host: string, protocol: string): Headers {
  // This one header is overwritten by the trusted ingress, never synthesized
  // from public XFF/Real-IP. Keep it for the server GraphQL signer/native hop.
  const ingressIp = incoming.get("x-jectstore-client-ip");
  const result = new Headers(incoming);
  for (const name of [...result.keys()]) {
    if (["forwarded", "x-tenant-host", "x-storefront-host", "x-original-host", "x-forwarded-host", "x-forwarded-proto"].includes(name)
      || name.startsWith("x-jectstore-") || name.startsWith("x-storefront-experience-")) result.delete(name);
  }
  if (ingressIp && !/[\s%,]/.test(ingressIp) && isIP(ingressIp)) result.set("x-jectstore-client-ip", ingressIp);
  result.set("x-tenant-host", host);
  result.set("x-storefront-host", host);
  result.set("x-forwarded-host", host);
  result.set("x-forwarded-proto", protocol === "http:" ? "http" : "https");
  return result;
}

const PREVIEW_QUERY_KEYS = new Set(["tenant", "host", "channel", "locale", "page", "version", "proposal", "actor", "session", "expires", "signature", "_editor_preview"]);
export function validatePreviewQuery(query: string): string {
  if (!query || query.length > 4096) throw new StorefrontExperienceError("preview-query", 400);
  const parameters = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const seen = new Set<string>();
  for (const [key, value] of parameters) {
    if (!PREVIEW_QUERY_KEYS.has(key) || seen.has(key) || !value || value.length > 512 || /[\u0000-\u001f]/.test(value)) throw new StorefrontExperienceError("preview-query", 400);
    seen.add(key);
  }
  for (const key of ["tenant", "host", "channel", "locale", "page", "version", "actor", "session", "expires", "signature"]) {
    if (!seen.has(key)) throw new StorefrontExperienceError("preview-query", 400);
  }
  // Keep the originally signed byte order/encoding, rather than reserializing it.
  return query.startsWith("?") ? query.slice(1) : query;
}

async function responseJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new StorefrontExperienceError(`backend-${response.status}`);
  if (!response.headers.get("content-type")?.includes("application/json")) throw new StorefrontExperienceError("response-type");
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) throw new StorefrontExperienceError("response-size");
  const reader = response.body?.getReader();
  if (!reader) throw new StorefrontExperienceError("empty-response");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new StorefrontExperienceError("response-size"); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new StorefrontExperienceError("response-json"); }
}

/** Node's fetch may discard an explicit Host. Use a bounded fixed-origin request
 * so Laravel receives the registered tenant Host without trusting public headers.
 * This transport never follows redirects and has no shared/persistent response cache.
 */
function fixedBackendRequest(url: URL, options: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = transport(url, {
      method: "GET", headers: Object.fromEntries(new Headers(options.headers)), signal: options.signal ?? undefined,
    }, (incoming) => {
      if (Number(incoming.headers["content-length"]) > MAX_RESPONSE_BYTES) {
        incoming.destroy(); request.destroy(); reject(new StorefrontExperienceError("response-size")); return;
      }
      const chunks: Buffer[] = [];
      let length = 0;
      incoming.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > MAX_RESPONSE_BYTES) {
          incoming.destroy(); request.destroy(); reject(new StorefrontExperienceError("response-size"));
        } else chunks.push(chunk);
      });
      incoming.on("error", reject);
      incoming.on("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        const status = incoming.statusCode || 502;
        if (status < 200 || [204, 205, 304].includes(status)) { reject(new StorefrontExperienceError(`backend-${status}`)); return; }
        resolve(new Response(new Uint8Array(Buffer.concat(chunks)), { status, headers: responseHeaders }));
      });
    });
    request.on("upgrade", (_response, socket) => { socket.destroy(); reject(new StorefrontExperienceError("backend-upgrade")); });
    request.on("error", reject);
    request.end();
  });
}

export async function fetchStorefrontExperience({
  host, incoming = new Headers(), pin, previewQuery, legacyGuestToken, fetcher = fixedBackendRequest,
}: {
  host: string;
  incoming?: Headers;
  pin?: string;
  previewQuery?: string;
  legacyGuestToken?: string;
  fetcher?: (url: URL, options: RequestInit) => Promise<Response>;
}): Promise<StorefrontExperience> {
  if (canonicalExperienceHost(host) !== host) throw new StorefrontExperienceError("host", 400);
  const preview = previewQuery !== undefined;
  const url = new URL(preview ? "/api/storefront/next-preview" : "/api/storefront/experience", configuredOrigin("backend"));
  if (preview) {
    url.search = validatePreviewQuery(previewQuery);
    if (url.searchParams.get("host") !== host) throw new StorefrontExperienceError("preview-host", 400);
  }
  const requestHeaders = new Headers({ Accept: "application/json", "Cache-Control": "no-store", Host: host });
  requestHeaders.set("x-tenant-host", host);
  requestHeaders.set("x-storefront-host", host);
  if (pin) requestHeaders.set("x-jectstore-experience-pin", pin);
  if (legacyGuestToken && legacyGuestToken.length <= 4096) requestHeaders.set("x-jectstore-legacy-guest-token", legacyGuestToken);
  const language = incoming.get("accept-language");
  if (language && language.length <= 256) requestHeaders.set("accept-language", language);
  const cookie = incoming.get("cookie");
  if (preview && cookie) requestHeaders.set("cookie", cookie);
  try {
    const response = await fetcher(url, {
      method: "GET", headers: requestHeaders, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    return parseStorefrontExperience(await responseJson(response), preview);
  } catch (error) {
    if (error instanceof StorefrontExperienceError) throw error;
    throw new StorefrontExperienceError("backend-unreachable");
  }
}

/** Ownership is explicit; runtime/auth/assets must never become native HTML. */
export function isExperiencePage(pathname: string): boolean {
  let normalized: string;
  try { normalized = decodeURIComponent(pathname); } catch { return false; }
  if (/[\\\u0000-\u001f]/.test(normalized)) return false;
  const reserved = ["/_next", "/api", "/admin", "/graphql", "/storage", "/themes", "/vendor", "/assets", "/css", "/js", "/cache", "/portal", "/__storefront-editor", "/__jectstore-native", "/checkout/recover", "/revalidate-theme"];
  return !reserved.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))
    && !/\.(?:avif|css|gif|ico|jpe?g|js|mjs|json|map|mp4|otf|pdf|png|svg|ttf|txt|webm|webp|woff2?|xml|webmanifest)$/i.test(normalized);
}

export function nativeDestination(pathname: string, search: string): URL {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || /[\\\u0000-\u001f]/.test(pathname)) throw new StorefrontExperienceError("native-path", 400);
  const destination = configuredOrigin("native");
  destination.pathname = pathname;
  destination.search = search;
  return destination;
}
