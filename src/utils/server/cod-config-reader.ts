import "server-only";

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { canonicalExperienceHost, isCentralExperienceHost, nativeDestination } from "@/lib/storefront-experience/runtime";
import { buildTenantForwardHeaders } from "@/utils/graphql-endpoint";
import { StorefrontConnectionUnavailable } from "./client-context";

export const COD_CONFIG_PATH = "/api/checkout/cod/config";
export const COD_CONFIG_TIMEOUT_MS = 5_000;
export const COD_CONFIG_MAX_BYTES = 262_144;

/** Only trusted process configuration selects a destination; Host scopes tenancy. */
export function nativeCodConfigRequest(host: string, productId: number) {
  try {
    if (canonicalExperienceHost(host) !== host || isIP(host) || isCentralExperienceHost(host)
      || !Number.isSafeInteger(productId) || productId <= 0) throw new Error();
    const tenant = buildTenantForwardHeaders(host);
    if (tenant["x-tenant-host"] !== host || tenant["x-storefront-host"] !== host) throw new Error();
    const url = nativeDestination(COD_CONFIG_PATH, `?product_id=${productId}`);
    return { url, headers: {
      Host: host, Accept: "application/json",
      "x-tenant-host": tenant["x-tenant-host"], "x-storefront-host": tenant["x-storefront-host"],
    } };
  } catch {
    throw new StorefrontConnectionUnavailable();
  }
}

/** No browser credentials, shared cache, redirects, proxy, or positive fallback. */
export function fetchNativeCodConfig(host: string, productId: number): Promise<unknown> {
  const { url, headers } = nativeCodConfigRequest(host, productId);
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "GET", headers, agent: false, signal: AbortSignal.timeout(COD_CONFIG_TIMEOUT_MS),
    }, response => {
      if (response.statusCode !== 200 || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers["content-type"] || "")
        || response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity"
        || Number(response.headers["content-length"]) > COD_CONFIG_MAX_BYTES) {
        response.destroy(); request.destroy(); reject(new StorefrontConnectionUnavailable()); return;
      }
      const chunks: Buffer[] = []; let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > COD_CONFIG_MAX_BYTES) {
          response.destroy(); request.destroy(); reject(new StorefrontConnectionUnavailable());
        } else chunks.push(chunk);
      });
      response.on("error", () => reject(new StorefrontConnectionUnavailable()));
      response.on("aborted", () => reject(new StorefrontConnectionUnavailable()));
      response.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(new StorefrontConnectionUnavailable()); }
      });
    });
    request.on("upgrade", (_response, socket) => { socket.destroy(); reject(new StorefrontConnectionUnavailable()); });
    request.on("error", () => reject(new StorefrontConnectionUnavailable()));
    request.end();
  });
}
