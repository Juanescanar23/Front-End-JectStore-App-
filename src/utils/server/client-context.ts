import "server-only";

import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { canonicalExperienceHost, configuredOrigin, experienceRequestAuthority } from "@/lib/storefront-experience/runtime";

export const CLIENT_CONTEXT_HEADER = "X-JectStore-Client-Context";
const INGRESS_IP_HEADER = "X-Jectstore-Client-IP";
const SIGNING_CONTEXT = "jectstore.client-context.v1\n";
type RequestHeaders = Pick<Headers, "get">;

export class StorefrontConnectionUnavailable extends Error {
  readonly status = 503;

  constructor() {
    super("No pudimos conectar con la tienda. Vuelve a intentarlo.");
    this.name = "StorefrontConnectionUnavailable";
  }
}

/** Use one strict host contract before URL resolution as well as signing. */
export function clientContextHost(incoming: RequestHeaders): string {
  try {
    const host = canonicalExperienceHost(experienceRequestAuthority(incoming.get("host")));
    if (isIP(host)) throw new Error();
    return host;
  } catch {
    throw new StorefrontConnectionUnavailable();
  }
}

/** No ambient request is normal for build tools; cache/SSR errors are not. */
export async function optionalRequestHeaders(): Promise<RequestHeaders | null> {
  try {
    return await headers();
  } catch (error) {
    if (error instanceof Error && (
      error.message.startsWith("`headers` was called outside a request scope.")
      || /used `headers\(\)` inside `[^`]+`\. This is not supported because `[^`]+` runs at build time without an HTTP request\./.test(error.message)
    )) return null;
    // In particular, do not swallow Next's dynamic-rendering bailouts or an
    // accidental headers() call inside unstable_cache.
    throw error;
  }
}

function destination(value: string): string {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
      || url.pathname !== "/graphql" || url.search || url.hash) throw new Error();
    return url.href;
  } catch {
    throw new StorefrontConnectionUnavailable();
  }
}

/** Build-time callers have no tenant authority. Only configured origins apply. */
export function backgroundGraphqlEndpoint(configuredEndpoint: string): string {
  try {
    return destination(configuredEndpoint === "/graphql"
      ? new URL("/graphql", configuredOrigin("backend")).href
      : configuredEndpoint);
  } catch {
    throw new StorefrontConnectionUnavailable();
  }
}

/**
 * Capture the trusted ingress context BEFORE entering a shared cache. The
 * returned transport signs the actual body at send time, never a cache key.
 * Nginx must overwrite the dedicated IP header; XFF/Real-IP are not authority.
 */
export function clientContextFetch(
  endpoint: string,
  incoming: RequestHeaders | null,
  transport: typeof fetch = fetch,
): typeof fetch {
  const target = destination(endpoint);
  let sign: ((body: string) => string) | null = null;
  if (incoming !== null) {
    try {
      const host = clientContextHost(incoming);
      const ip = incoming.get(INGRESS_IP_HEADER);
      const key = process.env.STOREFRONT_RUNTIME_SIGNING_KEY || "";
      if (!ip || /[\s%,]/.test(ip) || !isIP(ip)
        || Buffer.byteLength(key, "utf8") < 32) throw new Error();
      sign = (body) => {
        const issued_at = Math.floor(Date.now() / 1000);
        const payload = Buffer.from(JSON.stringify({
          v: 1, host, ip, method: "POST", path: "/graphql",
          body_sha256: createHash("sha256").update(body, "utf8").digest("hex"),
          issued_at, expires_at: issued_at + 60,
        }), "utf8").toString("base64url");
        const signature = createHmac("sha256", key).update(SIGNING_CONTEXT + payload).digest("hex");
        return `${payload}.${signature}`;
      };
    } catch {
      // Configuration/IP/host details and signing material never enter errors.
      throw new StorefrontConnectionUnavailable();
    }
  }

  return async (input, init) => {
    const actual = input instanceof Request ? input.url : String(input);
    if (destination(actual) !== target || init?.method?.toUpperCase() !== "POST"
      || typeof init.body !== "string") throw new StorefrontConnectionUnavailable();
    const outgoing = new Headers(init.headers);
    // Neither operation context nor an incoming browser header may supply a
    // proof. Unsigned network hints are also never forwarded to Laravel.
    for (const name of [...outgoing.keys()]) {
      if (name.startsWith("x-jectstore-client-") || name === "x-forwarded-for"
        || name === "x-real-ip" || name === "forwarded") outgoing.delete(name);
    }
    if (sign) outgoing.set(CLIENT_CONTEXT_HEADER, sign(init.body));
    return transport(input, {
      ...init,
      headers: outgoing,
      redirect: "error",
      cache: "no-store",
      next: { revalidate: 0 },
    } as RequestInit);
  };
}
