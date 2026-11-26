import "server-only";
import { cache } from "react";
import { getStorefrontDefaultChannel } from "./storefront-default-channel";
import { getVerifiedExperienceContext } from "@/lib/storefront-experience/server";
import { regionalMoneyLocale } from "@/utils/storefront-money";

/** Amounts remain untouched; their unit comes from the channel, never a preset. */
export const getStorefrontMoneyContext = cache(async () => {
  const experience = await getVerifiedExperienceContext();
  if (experience) {
    return { currencyCode: experience.currency, locale: regionalMoneyLocale(experience.locale) };
  }

  const channel = await getStorefrontDefaultChannel();
  const code = channel?.baseCurrency?.code;
  if (typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) throw new Error("The channel currency is unavailable.");
  return { currencyCode: code, locale: regionalMoneyLocale(channel?.defaultLocale?.code) };
});

export async function getStorefrontCurrencyCode(): Promise<string> {
  return (await getStorefrontMoneyContext()).currencyCode;
}
