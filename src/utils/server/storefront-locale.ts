import "server-only";

import { headers } from "next/headers";
import { GET_DEFAULT_CHANNEL } from "@/graphql";
import { graphqlRequest } from "@/lib/graphql-fetch";
import { resolveLocaleRoot } from "@/utils/storefront-copy";

type DefaultChannelResponse = {
  getDefaultChannel?: {
    defaultLocale?: {
      code?: string | null;
    } | null;
  } | null;
};

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
    const data = await graphqlRequest<DefaultChannelResponse>(
      GET_DEFAULT_CHANNEL,
      undefined,
      {
        tags: ["channel"],
        life: "hours",
      },
    );

    const channelLocale = normalizeLocaleCode(
      data?.getDefaultChannel?.defaultLocale?.code,
    );

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
