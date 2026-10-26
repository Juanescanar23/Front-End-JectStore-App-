import "server-only";
import { cache } from "react";
import { graphqlRequest } from "@/lib/graphql-fetch";
import { GET_DEFAULT_CHANNEL } from "@/graphql/theme/queries/DefaultChannel";

/** Amounts remain untouched; their unit comes from the channel, never a preset. */
export const getStorefrontCurrencyCode = cache(async (): Promise<string> => {
  const data = await graphqlRequest<{ getDefaultChannel?: { baseCurrency?: { code?: string | null } | null } | null }>(
    GET_DEFAULT_CHANNEL, undefined, { tags: ["channel"], life: "hours" },
  );
  const code = data?.getDefaultChannel?.baseCurrency?.code;
  if (typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) throw new Error("The channel currency is unavailable.");
  return code;
});
