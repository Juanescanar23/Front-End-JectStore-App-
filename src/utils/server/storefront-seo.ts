import "server-only";

import { GET_DEFAULT_CHANNEL, graphqlRequest } from "@/graphql";
import { getRequestBaseUrl } from "@/utils/server/request-base-url";

type DefaultChannelSeoResponse = {
  getDefaultChannel?: {
    name?: string | null;
    description?: string | null;
    logoUrl?: string | null;
    faviconUrl?: string | null;
    homeSeo?: {
      metaTitle?: string | null;
      metaDescription?: string | null;
    } | null;
  } | null;
};

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

export async function getStorefrontSeoPayload(): Promise<StorefrontSeoPayload | null> {
  const baseUrl = await getRequestBaseUrl();

  try {
    const data = await graphqlRequest<DefaultChannelSeoResponse>(
      GET_DEFAULT_CHANNEL,
      undefined,
      {
        tags: ["channel"],
        life: "hours",
      },
    );

    const channel = data?.getDefaultChannel;
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
}
