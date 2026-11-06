import "server-only";

import { cache } from "react";
import { GET_DEFAULT_CHANNEL } from "@/graphql/theme/queries/DefaultChannel";
import { graphqlRequest } from "@/lib/graphql-fetch";

type DefaultChannel = {
  name?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  homeSeo?: { metaTitle?: string | null; metaDescription?: string | null } | null;
  defaultLocale?: { code?: string | null } | null;
  baseCurrency?: { code?: string | null } | null;
};

// Coalesce concurrent reads in this render, including on a cold cache or
// in realtime mode. graphqlRequest still owns tenant scoping and invalidation.
export const getStorefrontDefaultChannel = cache(async () => {
  const data = await graphqlRequest<{ getDefaultChannel?: DefaultChannel | null }>(
    GET_DEFAULT_CHANNEL,
    undefined,
    { tags: ["channel"], life: "hours" },
  );
  return data?.getDefaultChannel ?? null;
});
