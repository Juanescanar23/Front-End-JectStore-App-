const ABSOLUTE_URL_REGEX = /^https?:\/\//i;
const FALLBACK_LANDLORD_HOST = "app.jectstore.com";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

const normalizeHost = (value?: string | null) =>
  (value ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();

const normalizeHostname = (value?: string | null) =>
  normalizeHost(value).replace(/:\d+$/, "");

const getLandlordHost = () =>
  (process.env.NEXT_PUBLIC_LANDLORD_HOST || FALLBACK_LANDLORD_HOST)
    .trim()
    .toLowerCase();

const normalizeBaseUrl = (value?: string | null) => {
  const trimmed = (value ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed;
  }
};

const resolveGraphqlPath = (configuredUrl?: string) => {
  if (!configuredUrl) return "";

  if (!ABSOLUTE_URL_REGEX.test(configuredUrl)) {
    return configuredUrl.startsWith("/") ? configuredUrl : `/${configuredUrl}`;
  }

  try {
    const parsed = new URL(configuredUrl);
    return `${parsed.pathname || "/graphql"}${parsed.search}`;
  } catch {
    return configuredUrl;
  }
};

export function resolveTenantHostForRequest(runtimeHost?: string | null): string {
  const landlordHost = getLandlordHost();
  const runtimeHostname = normalizeHostname(runtimeHost);

  if (
    !runtimeHostname ||
    runtimeHostname === landlordHost ||
    LOCAL_HOSTNAMES.has(runtimeHostname)
  ) {
    return "";
  }

  return runtimeHostname;
}

export function resolveTenantScopedGraphqlUrl(
  configuredUrl: string | undefined,
  runtimeHost?: string | null,
): string | undefined {
  if (!configuredUrl) return configuredUrl;
  if (!ABSOLUTE_URL_REGEX.test(configuredUrl)) return configuredUrl;

  try {
    const parsed = new URL(configuredUrl);
    const endpointHost = parsed.hostname.toLowerCase();
    const landlordHost = getLandlordHost();
    const runtimeHostname = normalizeHostname(runtimeHost);

    if (
      endpointHost === landlordHost &&
      runtimeHostname &&
      runtimeHostname !== landlordHost
    ) {
      const pathname = parsed.pathname || "/graphql";
      return `${pathname}${parsed.search}`;
    }
  } catch {
    return configuredUrl;
  }

  return configuredUrl;
}

export function resolveServerGraphqlUrl(
  configuredUrl: string | undefined,
  runtimeHost?: string | null,
): string | undefined {
  if (!configuredUrl) return configuredUrl;

  const tenantHost = resolveTenantHostForRequest(runtimeHost);
  const serverBase = normalizeBaseUrl(process.env.BAGISTO_SERVER_ENDPOINT);
  const path = resolveGraphqlPath(configuredUrl);

  if (tenantHost && serverBase && path) {
    return `${serverBase}${path}`;
  }

  return resolveTenantScopedGraphqlUrl(configuredUrl, runtimeHost) ?? configuredUrl;
}

const resolveTenantOrigin = (runtimeHost?: string | null) => {
  const tenantHost = resolveTenantHostForRequest(runtimeHost);

  if (!tenantHost) {
    return "";
  }

  const protocol = LOCAL_HOSTNAMES.has(normalizeHostname(tenantHost))
    ? "http"
    : "https";

  return `${protocol}://${tenantHost}`;
};

export function buildTenantForwardHeaders(
  runtimeHost?: string | null,
): Record<string, string> {
  const tenantHost = resolveTenantHostForRequest(runtimeHost);

  if (!tenantHost) {
    return {};
  }

  const origin = resolveTenantOrigin(tenantHost);

  return {
    "x-tenant-host": tenantHost,
    "x-storefront-host": tenantHost,
    ...(origin ? { Origin: origin, Referer: `${origin}/` } : {}),
  };
}
