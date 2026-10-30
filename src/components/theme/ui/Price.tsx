"use client";

import { useStorefrontCurrency } from "@/providers/StorefrontCurrencyProvider";
import { formatStorefrontPrice, normalizeCurrencyCode } from "@/utils/storefront-money";

export const Price = ({
  amount,
  className,
  currencyCode,
  ...rest
}: {
  amount: string;
  className?: string;
  /** Omitted: channel currency. Null: explicitly unknown (e.g. a legacy order). */
  currencyCode?: string | null;
} & React.ComponentProps<"p">) => {
  const channelCurrency = useStorefrontCurrency();
  const resolvedCurrency = normalizeCurrencyCode(currencyCode === undefined ? channelCurrency : currencyCode);

  return (
    <p className={className} suppressHydrationWarning={true} data-currency={resolvedCurrency ?? undefined} {...rest}>
      {formatStorefrontPrice(amount, resolvedCurrency)}
    </p>
  );
};
