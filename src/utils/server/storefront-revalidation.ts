import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { canonicalCacheHostname, isCanonicalTenantHostname } from "../storefront-cache-scope";

const DOMAIN = "jectstore.storefront.revalidate.v1\n";
const ENDPOINT = "/api/internal/storefront/revalidate";
const MAX_BODY_BYTES = 16_384;
const MAX_CLOCK_SKEW_SECONDS = 300;
const REPLAY_RETENTION_SECONDS = 900;
const PAYLOAD_KEYS = ["protocol_version", "tenant_id", "hosts", "event", "issued_at", "request_id"];

export type StorefrontRevalidationPayload = {
  protocol_version: 1;
  tenant_id: string;
  hosts: string[];
  event: string;
  issued_at: number;
  request_id: string;
};

export type RevalidationInput = {
  method: string;
  url: string;
  host: string;
  contentType: string;
  signature: string;
  body: string;
};

export type RevalidationOptions = {
  signingKey: string;
  allowedReceiverHosts: string[];
  replayDirectory: string;
  now?: () => number;
  invalidateHosts: (hosts: string[]) => Promise<void>;
};

type RevalidationResult = { status: number; body: Record<string, unknown> };
const reject = (status: number, message: string): RevalidationResult => ({ status, body: { revalidated: false, message } });

/** Bound the transport before buffering or parsing an unauthenticated body. */
export async function readRevalidationBody(stream: ReadableStream<Uint8Array> | null, contentLength: string | null): Promise<string> {
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) throw new Error("Invalid body size.");
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("Invalid body size.");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function parsePayload(body: string, now: number): StorefrontRevalidationPayload | null {
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return null; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const data = payload as Record<string, unknown>;
  if (Object.keys(data).length !== PAYLOAD_KEYS.length || PAYLOAD_KEYS.some((key) => !Object.hasOwn(data, key))) return null;
  if (data.protocol_version !== 1
    || typeof data.tenant_id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(data.tenant_id)
    || typeof data.event !== "string" || !/^[a-zA-Z0-9._:-]{1,160}$/.test(data.event)
    || typeof data.request_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(data.request_id)
    || !Number.isSafeInteger(data.issued_at) || Math.abs(now - (data.issued_at as number)) > MAX_CLOCK_SKEW_SECONDS
    || !Array.isArray(data.hosts) || data.hosts.length < 1 || data.hosts.length > 50
    || data.hosts.some((host) => typeof host !== "string" || !isCanonicalTenantHostname(host))) return null;
  const hosts = data.hosts as string[];
  if (new Set(hosts).size !== hosts.length || hosts.join("\n") !== [...hosts].sort().join("\n")) return null;
  return data as StorefrontRevalidationPayload;
}

async function privateReplayDirectory(configured: string): Promise<string> {
  if (!configured || !isAbsolute(configured) || normalize(configured) !== configured
    || configured === "/" || /(?:^|\/)(?:\.next|node_modules|public)(?:\/|$)/.test(configured)) throw new Error("Invalid replay store.");
  const actual = await realpath(configured);
  const info = await lstat(configured);
  if (actual !== configured || !info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0
    || (typeof process.getuid === "function" && info.uid !== process.getuid())) throw new Error("Replay store is not private.");
  return actual;
}

async function pruneExpiredClaims(directory: string, now: number): Promise<void> {
  // Only inspect a bounded number of regular files in our private namespace.
  // No recursive deletion, no following links, no scanning another cache store.
  const entries = await opendir(directory);
  let visited = 0;
  for await (const entry of entries) {
    if (++visited > 64) break;
    if (!entry.isFile() || !/^[a-f0-9]{64}\.claim$/.test(entry.name)) continue;
    const path = join(directory, entry.name);
    try {
      const info = await lstat(path);
      if (info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.mtimeMs / 1000 < now - REPLAY_RETENTION_SECONDS) await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function claimRequest(payload: StorefrontRevalidationPayload, directory: string, now: number): Promise<boolean> {
  const validatedDirectory = await privateReplayDirectory(directory);
  const key = createHash("sha256").update(`${payload.tenant_id}\n${payload.request_id}`).digest("hex");
  let file;
  try {
    file = await open(join(validatedDirectory, `${key}.claim`), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    await file.writeFile(JSON.stringify({ issued_at: payload.issued_at, claimed_at: now }));
  } finally {
    await file.close();
  }
  await pruneExpiredClaims(validatedDirectory, now);
  return true;
}

/** Pure protocol boundary plus an atomic, persistent single-host replay store. */
export async function handleStorefrontRevalidation(input: RevalidationInput, options: RevalidationOptions): Promise<RevalidationResult> {
  if (input.method !== "POST") return reject(405, "POST required.");
  let url: URL;
  try { url = new URL(input.url); } catch { return reject(400, "Invalid request."); }
  const host = canonicalCacheHostname(input.host);
  if (url.pathname !== ENDPOINT || url.search || !host || canonicalCacheHostname(url.host) !== host || !options.allowedReceiverHosts.includes(host)) return reject(403, "Invalid platform scope.");
  if (options.signingKey.length < 32 || !options.replayDirectory) return reject(503, "Revalidation is not configured.");
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(input.contentType) || Buffer.byteLength(input.body, "utf8") > MAX_BODY_BYTES) return reject(400, "Invalid request.");
  if (!/^sha256=[a-f0-9]{64}$/.test(input.signature)) return reject(401, "Invalid signature.");
  const expected = createHmac("sha256", options.signingKey).update(DOMAIN).update(input.body).digest();
  const supplied = Buffer.from(input.signature.slice(7), "hex");
  if (!timingSafeEqual(expected, supplied)) return reject(401, "Invalid signature.");
  const now = options.now ? options.now() : Math.floor(Date.now() / 1000);
  const payload = parsePayload(input.body, now);
  if (!payload || payload.hosts.some((tenantHost) => options.allowedReceiverHosts.includes(tenantHost))) return reject(400, "Invalid payload.");
  try {
    if (!await claimRequest(payload, options.replayDirectory, now)) return reject(409, "Repeated request.");
    await options.invalidateHosts(payload.hosts);
  } catch {
    return reject(503, "Revalidation could not be confirmed.");
  }
  return {
    status: 200,
    body: {
      revalidated: true,
      protocol_version: payload.protocol_version,
      tenant_id: payload.tenant_id,
      hosts: payload.hosts,
      request_id: payload.request_id,
    },
  };
}
