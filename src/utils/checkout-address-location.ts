export type CheckoutCountry = { code: string; name: string };
export type CheckoutRegion = { code: string; name: string };
export type CheckoutLocations = {
  countries: CheckoutCountry[];
  states: Record<string, CheckoutRegion[]>;
};

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export const checkoutCountryCode = (value: unknown): string => {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(code) ? code : "";
};

const CITY_MAX_LENGTH = 255;
const CITY_START = /^[\p{L}\p{Nd}]/u;
const CITY_LETTER = /[\p{Lu}\p{Ll}\p{Lt}\p{Lo}]/u;
const CITY_UNSUPPORTED = /[^\p{L}\p{M}\p{Nd}\p{Zs}\p{Pd}.'’,()·・\u200c\u200d]/u;
const CITY_DETACHED_MARK = /(?:^|[^\p{L}\p{M}])\p{M}/u;
const CITY_DETACHED_JOINER = /(?:^|[^\p{L}\p{M}])[\u200c\u200d]|[\u200c\u200d](?!\p{L})/u;

/** Keep the spelling (including accents and word joiners), but use one canonical Unicode form. */
export const normalizeCheckoutCity = (value: unknown): string =>
  typeof value === "string" ? value.normalize("NFC").replace(/^\p{Zs}+|\p{Zs}+$/gu, "") : "";

export function isValidCheckoutCity(value: unknown): boolean {
  const city = normalizeCheckoutCity(value);
  return Array.from(city).length <= CITY_MAX_LENGTH
    && CITY_START.test(city)
    && CITY_LETTER.test(city)
    && !CITY_UNSUPPORTED.test(city)
    && !CITY_DETACHED_MARK.test(city)
    && !CITY_DETACHED_JOINER.test(city);
}

export function isCanonicalCheckoutStatesPayload(value: unknown): boolean {
  const envelope = record(value);
  if (!Object.hasOwn(envelope, "data")) return false;
  const data = envelope.data;
  if (data === null || typeof data !== "object") return false;
  // PHP serializes an entirely empty grouped array as [], not {}.
  if (Array.isArray(data)) return data.length === 0;
  return Object.entries(data).every(([country, rows]) => /^[A-Z]{2}$/.test(country) && Array.isArray(rows));
}

export function isCheckoutAddressSaveSuccessful(value: unknown): boolean {
  return record(record(record(record(value).data).createCheckoutAddress).checkoutAddress).success === true;
}

/** Only the canonical public REST shapes; no tenant/currency-based guesses or first-country fallback. */
export function parseCheckoutLocations(countryPayload: unknown, statePayload: unknown): CheckoutLocations {
  const countryRows = record(countryPayload).data;
  const countries: CheckoutCountry[] = [];
  const known = new Set<string>();
  for (const value of Array.isArray(countryRows) ? countryRows : []) {
    const row = record(value);
    const code = checkoutCountryCode(row.code);
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (code && name && name.length <= 200 && !known.has(code)) {
      countries.push({ code, name });
      known.add(code);
    }
  }
  const grouped = record(record(statePayload).data);
  const states: Record<string, CheckoutRegion[]> = {};
  for (const { code: country } of countries) {
    const rows = grouped[country];
    const regionCodes = new Set<string>();
    states[country] = [];
    for (const value of Array.isArray(rows) ? rows : []) {
      const row = record(value);
      const code = typeof row.code === "string" ? row.code.trim() : "";
      const name = typeof row.default_name === "string" ? row.default_name.trim() : "";
      if (code && code.length <= 64 && !/[<>\x00-\x1f]/.test(code) && name && name.length <= 200
        && (!row.country_code || checkoutCountryCode(row.country_code) === country) && !regionCodes.has(code)) {
        states[country].push({ code, name });
        regionCodes.add(code);
      }
    }
  }
  return { countries, states };
}

const comparableRegion = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[\s.,-]+/g, "");

/** Saved names remain visible and can resolve to their canonical code; unrelated countries never share state. */
export function checkoutRegionCode(country: string, value: unknown, locations: CheckoutLocations): string {
  const state = typeof value === "string" ? value.trim() : "";
  const regions = locations.states[checkoutCountryCode(country)] || [];
  const matched = regions.find((region) => comparableRegion(region.code) === comparableRegion(state)
    || comparableRegion(region.name) === comparableRegion(state));
  return matched?.code || state;
}

export function checkoutLocationError(countryValue: unknown, stateValue: unknown, locations: CheckoutLocations): "country" | "state" | null {
  const country = checkoutCountryCode(countryValue);
  if (!country || !locations.countries.some((entry) => entry.code === country)) return "country";
  const regions = locations.states[country] || [];
  const state = checkoutRegionCode(country, stateValue, locations);
  // Countries without canonical subdivisions use the existing free-text/backend validation contract.
  if (regions.length > 0 && !regions.some((region) => region.code === state)) return "state";
  return null;
}

export function checkoutLocationAfterCountryChange(previousCountry: string, nextCountry: string, previousState: string) {
  const country = checkoutCountryCode(nextCountry);
  return { country, state: country === checkoutCountryCode(previousCountry) ? previousState : "" };
}

/** RHF tracks fields separately: an untouched empty region must not arrive from another address/country. */
export function checkoutLocationForReset(
  incoming: { country: string; state: string },
  current: { country: string; state: string },
  countryWasEdited: boolean,
) {
  return countryWasEdited ? { country: checkoutCountryCode(current.country), state: current.state } : incoming;
}
