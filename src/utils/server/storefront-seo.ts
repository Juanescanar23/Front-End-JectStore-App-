import "server-only";

import { cache } from "react";
import { getStorefrontDefaultChannel } from "./storefront-default-channel";
import { getRequestBaseUrl } from "@/utils/server/request-base-url";

export type StorefrontSeoPayload = {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

const normalizeText = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const toAbsoluteUrl = (value: string | undefined, baseUrl?: string | null) => {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;

  const normalizedPath = value.startsWith("/") ? value : `/${value}`;

  if (!baseUrl) {
    return normalizedPath;
  }

  return `${baseUrl}${normalizedPath}`;
};

export const getStorefrontSeoPayload = cache(async (): Promise<StorefrontSeoPayload | null> => {
  const baseUrl = await getRequestBaseUrl();

  try {
    const channel = await getStorefrontDefaultChannel();
    if (!channel) return null;

    const siteName = normalizeText(channel.name);
    const title = normalizeText(channel.homeSeo?.metaTitle) || siteName;
    const description =
      normalizeText(channel.homeSeo?.metaDescription) ||
      normalizeText(channel.description);
    const image = toAbsoluteUrl(
      normalizeText(channel.logoUrl) || normalizeText(channel.faviconUrl),
      baseUrl,
    );

    if (!title && !description && !image && !siteName) {
      return null;
    }

    return {
      title,
      description,
      image,
      siteName,
    };
  } catch (error) {
    console.error("Unable to resolve storefront SEO payload:", error);
    return null;
  }
});
