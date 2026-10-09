import { headers } from "next/headers";
import { TenantWhatsAppConfig } from "@/utils/whatsapp";
import { storefrontCacheTags } from "../storefront-cache-scope";

const FALLBACK_LANDLORD_HOST = "app.jectstore.com";
const FALLBACK_LANDLORD_SCHEME = "https";

const normalizeHost = (value?: string | null) =>
  (value || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/:\d+$/, "")
    .replace(/\/$/, "");

const normalizeScheme = (value?: string | null) =>
  (value || FALLBACK_LANDLORD_SCHEME).replace(/:$/, "").toLowerCase();

export async function getTenantWhatsAppConfig(): Promise<TenantWhatsAppConfig | null> {
  const headerStore = await headers();
  const runtimeHost = normalizeHost(
    headerStore.get("x-forwarded-host") ?? headerStore.get("host"),
  );

  if (!runtimeHost) {
    return null;
  }

  const landlordHost = normalizeHost(
    process.env.NEXT_PUBLIC_LANDLORD_HOST || FALLBACK_LANDLORD_HOST,
  );

  if (!landlordHost || runtimeHost === landlordHost) {
    return null;
  }

  const landlordScheme = normalizeScheme(process.env.NEXT_PUBLIC_LANDLORD_SCHEME);
  const endpoint = `${landlordScheme}://${landlordHost}/api/storefront/whatsapp-config?host=${encodeURIComponent(runtimeHost)}`;

  try {
    const response = await fetch(endpoint, {
      next: { revalidate: 30, tags: await storefrontCacheTags(runtimeHost, ["whatsapp"]) },
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      enabled?: unknown;
      allows_checkout?: unknown;
      wa_base_url?: unknown;
      phone_e164?: unknown;
    };

    return {
      enabled: Boolean(payload?.enabled),
      allowsCheckout:
        typeof payload?.allows_checkout === "boolean"
          ? payload.allows_checkout
          : true,
      waBaseUrl:
        typeof payload?.wa_base_url === "string" && payload.wa_base_url.trim() !== ""
          ? payload.wa_base_url
          : null,
      phoneE164:
        typeof payload?.phone_e164 === "string" && payload.phone_e164.trim() !== ""
          ? payload.phone_e164
          : null,
    };
  } catch {
    return null;
  }
}
