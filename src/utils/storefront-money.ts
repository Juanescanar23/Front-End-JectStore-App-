/** Monetary values are never converted or rewritten by this display policy. */
export function normalizeCurrencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

const USD_LOCAL_REGIONS = new Set(["US", "EC", "PA", "SV", "PR"]);

export function regionalMoneyLocale(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const locale = new Intl.Locale(value.trim().replaceAll("_", "-"));
    if (!locale.region || !/^[A-Z]{2}$/.test(locale.region)) return null;

    const resolved = new Intl.Locale(new Intl.NumberFormat(locale.baseName).resolvedOptions().locale);
    if (resolved.region === locale.region) return locale.baseName;

    const regionalDefault = new Intl.Locale(`und-${locale.region}`).maximize();
    return new Intl.Locale(regionalDefault.language, { region: locale.region }).baseName;
  } catch {
    return null;
  }
}

export function formatStorefrontPrice(amount: string, currencyCode: string | null, locale?: string | null): string {
  if (!currencyCode) return "—";

  const number = parseFloat(amount);
  if (!Number.isFinite(number)) return "—";

  const region = locale ? new Intl.Locale(locale).region : undefined;
  const useLocalDollar = currencyCode === "USD" && region !== undefined && USD_LOCAL_REGIONS.has(region);

  return new Intl.NumberFormat(locale ?? (currencyCode === "COP" ? "en-US" : undefined), {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: !locale || useLocalDollar ? "narrowSymbol" : "symbol",
    ...(locale ? { useGrouping: "always" } : {}),
    ...(currencyCode === "COP" ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
  }).format(number);
}
