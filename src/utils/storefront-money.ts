/** Monetary values are never converted or rewritten by this display policy. */
export function normalizeCurrencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function formatStorefrontPrice(amount: string, currencyCode: string | null): string {
  if (!currencyCode) return "—";

  return new Intl.NumberFormat(currencyCode === "COP" ? "en-US" : undefined, {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
    ...(currencyCode === "COP" ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
  }).format(parseFloat(amount));
}
