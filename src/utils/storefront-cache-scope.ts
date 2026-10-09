/** One owner tag per registered hostname, independent of HTTP/HTTPS aliases. */
export function canonicalCacheHostname(value: string): string | null {
  if (!value || /[\s,@/?#\\]/.test(value)) return null;
  try {
    const url = new URL(`http://${value}`);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export function isCanonicalTenantHostname(host: string): boolean {
  return canonicalCacheHostname(host) === host
    && host.includes(".")
    && !/^\d+\.\d+\.\d+\.\d+$/.test(host);
}

async function digest(value: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function storefrontHostTag(host: string): Promise<string> {
  const canonical = canonicalCacheHostname(host);
  if (!canonical) throw new Error("A canonical storefront cache owner is required.");
  return `sf:v1:${await digest(canonical)}`;
}

export async function storefrontCacheTags(host: string, entities: string[] = []): Promise<string[]> {
  const owner = await storefrontHostTag(host);
  const scoped = await Promise.all(entities.map(async (entity) => `${owner}:e:${await digest(entity)}`));
  return Array.from(new Set([owner, ...scoped]));
}
