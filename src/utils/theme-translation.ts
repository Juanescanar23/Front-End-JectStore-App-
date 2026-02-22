type TranslationWithLocale = {
  localeCode?: string | null;
  locale?: string | null;
};

const normalizeLocale = (value?: string | null) => {
  if (!value) return "";

  return value.trim().toLowerCase().replace("_", "-");
};

export function pickTranslationByLocale<T extends TranslationWithLocale>(
  translations: T[] | null | undefined,
  localeCode?: string | null,
): T | undefined {
  if (!translations?.length) return undefined;

  const normalizedLocale = normalizeLocale(localeCode);

  if (!normalizedLocale) {
    return translations[0];
  }

  const exactMatch = translations.find((translation) => {
    const translationLocale = normalizeLocale(
      translation.localeCode ?? translation.locale,
    );

    return translationLocale === normalizedLocale;
  });

  if (exactMatch) {
    return exactMatch;
  }

  const localeRoot = normalizedLocale.split("-")[0];
  if (!localeRoot) {
    return translations[0];
  }

  const rootMatch = translations.find((translation) => {
    const translationLocale = normalizeLocale(
      translation.localeCode ?? translation.locale,
    );

    return translationLocale.split("-")[0] === localeRoot;
  });

  return rootMatch ?? translations[0];
}
