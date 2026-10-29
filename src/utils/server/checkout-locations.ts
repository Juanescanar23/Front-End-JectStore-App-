import "server-only";

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { canonicalExperienceHost, configuredOrigin } from "@/lib/storefront-experience/runtime";
import { isCanonicalCheckoutStatesPayload, parseCheckoutLocations, type CheckoutLocations } from "@/utils/checkout-address-location";

type LocationPath = "/api/locations/countries" | "/api/locations/states";
const MAX_BYTES = 2 * 1024 * 1024;

/** Fixed backend destination and paths, bounded GET, canonical ingress Host; never a public host query/URL. */
function readPublicLocations(host: string, path: LocationPath): Promise<unknown> {
  if (canonicalExperienceHost(host) !== host) throw new Error("checkout-locations-unavailable");
  const url = new URL(path, configuredOrigin("backend"));
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = transport(url, {
      method: "GET", headers: { Host: host, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    }, (response) => {
      if (response.statusCode !== 200 || !response.headers["content-type"]?.includes("application/json")
        || Number(response.headers["content-length"]) > MAX_BYTES) {
        response.destroy();
        reject(new Error("checkout-locations-unavailable"));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          response.destroy();
          reject(new Error("checkout-locations-unavailable"));
        } else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(new Error("checkout-locations-unavailable")); }
      });
    });
    request.on("upgrade", (_response, socket) => {
      socket.destroy();
      reject(new Error("checkout-locations-unavailable"));
    });
    request.on("error", reject);
    request.end();
  });
}

export async function getCheckoutLocations(host: string): Promise<CheckoutLocations> {
  const [countries, states] = await Promise.all([
    readPublicLocations(host, "/api/locations/countries"),
    readPublicLocations(host, "/api/locations/states"),
  ]);
  if (!isCanonicalCheckoutStatesPayload(states)) throw new Error("checkout-locations-unavailable");
  const result = parseCheckoutLocations(countries, states);
  if (result.countries.length === 0) throw new Error("checkout-locations-unavailable");
  return result;
}
