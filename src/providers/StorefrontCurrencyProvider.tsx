"use client";

import { createContext, useContext, type ReactNode } from "react";
import { normalizeCurrencyCode } from "@/utils/storefront-money";

const StorefrontCurrencyContext = createContext<{ currencyCode: string | null; locale: string | null }>({
  currencyCode: null,
  locale: null,
});

/** Request-scoped channel metadata supplied by the server; no browser storage. */
export function StorefrontCurrencyProvider({
  currencyCode,
  locale = null,
  children,
}: { currencyCode: string | null; locale?: string | null; children: ReactNode }) {
  return (
    <StorefrontCurrencyContext.Provider value={{ currencyCode: normalizeCurrencyCode(currencyCode), locale }}>
      {children}
    </StorefrontCurrencyContext.Provider>
  );
}

export const useStorefrontCurrency = () => useContext(StorefrontCurrencyContext);
