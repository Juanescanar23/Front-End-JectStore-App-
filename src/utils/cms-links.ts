export type CmsPageSearchParams = Record<string, string | string[] | undefined>;

/** Preserve an explicit footer destination; never infer it from its final segment. */
export function resolveFooterHref(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "/";
  const href = value.trim();
  let decoded = href;
  for (let index = 0; index < 8; index++) {
    const next = decoded.replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
    if (next === decoded) break;
    decoded = next;
  }
  if (/[\\<>\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith("//")) return "/";

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
  if (scheme === "http" || scheme === "https") {
    try {
      const url = new URL(href);
      return url.hostname && !url.username && !url.password ? href : "/";
    } catch {
      return "/";
    }
  }
  if (scheme === "mailto" || scheme === "tel") {
    return href.slice(href.indexOf(":") + 1).trim() ? href : "/";
  }
  if (scheme) return "/";
  if (href.startsWith("?") || href.startsWith("#")) return href;

  const decodedPath = decoded.split(/[?#]/, 1)[0];
  if (decodedPath.split("/").some((segment) => segment === "." || segment === "..")) return "/";
  if (href.startsWith("/")) return href;
  if (decodedPath.includes(":")) return "/";
  return `/${href}`;
}

/** Match the existing public CMS resolver's exact slug boundary. */
export function cmsPageAliasHref(
  slug: unknown,
  searchParams: CmsPageSearchParams = {},
): string | null {
  if (typeof slug !== "string" || slug.length < 1 || slug.length > 255
    || !/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(slug)) return null;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") query.append(key, value);
    else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") query.append(key, entry);
      }
    }
  }
  const suffix = query.toString();
  return `/${slug}${suffix ? `?${suffix}` : ""}`;
}
