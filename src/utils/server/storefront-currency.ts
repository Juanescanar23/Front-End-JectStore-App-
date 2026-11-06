import "server-only";
import { cache } from "react";
import { getStorefrontDefaultChannel } from "./storefront-default-channel";
import { getVerifiedExperienceContext } from "@/lib/storefront-experience/server";

/** Amounts remain untouched; their unit comes from the channel, never a preset. */
export const getStorefrontCurrencyCode = cache(async (): Promise<string> => {
  const experience = await getVerifiedExperienceContext();
  if (experience) return experience.currency;

  const channel = await getStorefrontDefaultChannel();
  const code = channel?.baseCurrency?.code;
  if (typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) throw new Error("The channel currency is unavailable.");
  return code;
});
