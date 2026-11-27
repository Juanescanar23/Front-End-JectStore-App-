import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getStorefrontDefaultChannel } from "./storefront-default-channel";
import { canonicalExperienceHost, fetchStorefrontMoneyLocale } from "@/lib/storefront-experience/runtime";
import { getVerifiedExperienceContext } from "@/lib/storefront-experience/server";
import { regionalMoneyLocale } from "@/utils/storefront-money";

/** Amounts remain untouched; their unit comes from the channel, never a preset. */
export const getStorefrontMoneyContext = cache(async () => {
  const experience = await getVerifiedExperienceContext();
  if (experience) {
    return {
      currencyCode: experience.currency,
      locale: regionalMoneyLocale(experience.money_locale) ?? regionalMoneyLocale(experience.locale),
    };
  }

  const channel = await getStorefrontDefaultChannel();
  const code = channel?.baseCurrency?.code;
  if (typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) throw new Error("The channel currency is unavailable.");
  const channelLocale = regionalMoneyLocale(channel?.defaultLocale?.code);
  try {
    const host = canonicalExperienceHost((await headers()).get("host"));
    const moneyLocale = regionalMoneyLocale(await fetchStorefrontMoneyLocale(host));
    return { currencyCode: code, locale: moneyLocale ?? channelLocale };
  } catch {
    // Keep rendering during rollout or when the optional tenant metadata is unavailable.
    return { currencyCode: code, locale: channelLocale };
  }
});

export async function getStorefrontCurrencyCode(): Promise<string> {
  return (await getStorefrontMoneyContext()).currencyCode;
}
