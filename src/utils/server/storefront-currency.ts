import "server-only";
import { cache } from "react";
import { graphqlRequest } from "@/lib/graphql-fetch";
import { GET_DEFAULT_CHANNEL } from "@/graphql/theme/queries/DefaultChannel";
import { getVerifiedExperienceContext } from "@/lib/storefront-experience/server";

/** Amounts remain untouched; their unit comes from the channel, never a preset. */
export const getStorefrontCurrencyCode = cache(async (): Promise<string> => {
  const experience = await getVerifiedExperienceContext();
  if (experience) return experience.currency;

  const data = await graphqlRequest<{ getDefaultChannel?: { baseCurrency?: { code?: string | null } | null } | null }>(
    GET_DEFAULT_CHANNEL, undefined, { tags: ["channel"], life: "hours" },
  );
  const code = data?.getDefaultChannel?.baseCurrency?.code;
  if (typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) throw new Error("The channel currency is unavailable.");
  return code;
});
