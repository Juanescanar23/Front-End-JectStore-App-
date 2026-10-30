"use client";

import { createContext, useContext, type ReactNode } from "react";
import { normalizeCurrencyCode } from "@/utils/storefront-money";

const StorefrontCurrencyContext = createContext<string | null>(null);

/** Request-scoped channel metadata supplied by the server; no browser storage. */
export function StorefrontCurrencyProvider({ currencyCode, children }: { currencyCode: string | null; children: ReactNode }) {
  return (
    <StorefrontCurrencyContext.Provider value={normalizeCurrencyCode(currencyCode)}>
      {children}
    </StorefrontCurrencyContext.Provider>
  );
}

export const useStorefrontCurrency = () => useContext(StorefrontCurrencyContext);
