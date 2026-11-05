type CmsUpdatedAt = { label: string; dateLabel: string; dateTime: string };

/** Missing/invalid metadata never becomes today's date or a render exception. */
export function cmsUpdatedAt(value: unknown, localeCode?: string | null): CmsUpdatedAt | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const source = value.trim();
  const parsed = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})?)?$/.exec(source);
  const calendarPart = parsed?.[1];
  if (!calendarPart || Number(calendarPart.slice(0, 4)) < 1) return null;
  const calendar = new Date(`${calendarPart}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== calendarPart) return null;
  if (parsed?.[2] && (Number(parsed[2]) > 23 || Number(parsed[3]) > 59 || Number(parsed[4]) > 59)) return null;
  if (parsed?.[5] && !Number.isFinite(new Date(source.replace(" ", "T")).getTime())) return null;

  let locale = "es";
  try {
    const canonical = Intl.getCanonicalLocales(localeCode?.trim().replace(/_/g, "-") || "es")[0];
    if (/^(es|en)(?:-|$)/i.test(canonical)) locale = canonical;
  } catch {
    // Keep the same Spanish fallback as the storefront's existing es/en copy.
  }
  return {
    label: locale.toLowerCase().startsWith("en") ? "Last updated" : "Última actualización",
    // Format the API's calendar date, without inventing a zone for its SQL timestamp.
    dateLabel: new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(calendar),
    dateTime: calendarPart,
  };
}
