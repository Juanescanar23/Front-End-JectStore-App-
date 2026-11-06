import "server-only";

import { headers } from "next/headers";
import { getStorefrontDefaultChannel } from "./storefront-default-channel";
import { resolveLocaleRoot } from "@/utils/storefront-copy";

export const normalizeLocaleCode = (value?: string | null) => {
  if (!value) return "";

  return value.trim().toLowerCase().replace("_", "-");
};

const extractLocaleFromAcceptLanguage = (value?: string | null) => {
  if (!value) return "";

  const firstLanguage = value.split(",")[0]?.trim();
  const normalized = normalizeLocaleCode(firstLanguage);

  if (!normalized) return "";

  return normalized.split("-")[0] || normalized;
};

export async function getStorefrontLocaleCode(): Promise<string | undefined> {
  const headerStore = await headers();

  const explicitLocale =
    headerStore.get("x-locale") ?? headerStore.get("x-locale-code");
  const normalizedExplicitLocale = normalizeLocaleCode(explicitLocale);

  if (normalizedExplicitLocale) {
    return normalizedExplicitLocale;
  }

  try {
    const channel = await getStorefrontDefaultChannel();
    const channelLocale = normalizeLocaleCode(channel?.defaultLocale?.code);

    if (channelLocale) {
      return channelLocale;
    }
  } catch (error) {
    console.error("Unable to resolve storefront locale from channel:", error);
  }

  const acceptLanguageLocale = extractLocaleFromAcceptLanguage(
    headerStore.get("accept-language"),
  );

  return acceptLanguageLocale || undefined;
}

export async function getStorefrontLocaleRoot(): Promise<string> {
  return resolveLocaleRoot(await getStorefrontLocaleCode());
}
