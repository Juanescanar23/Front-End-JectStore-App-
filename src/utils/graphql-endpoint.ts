const ABSOLUTE_URL_REGEX = /^https?:\/\//i;
const FALLBACK_LANDLORD_HOST = "app.jectstore.com";

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

