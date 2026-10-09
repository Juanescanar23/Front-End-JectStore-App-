const normalizeLocale = (value?: string | null) => {
  if (!value) return "";

  return value.trim().toLowerCase().replace("_", "-");
};

export const resolveLocaleRoot = (value?: string | null) => {
  const normalized = normalizeLocale(value);

  if (!normalized) {
    return "es";
  }

  return normalized.split("-")[0] || "es";
};

export const detectClientLocaleRoot = () => {
  if (typeof document !== "undefined") {
    const documentLocale = resolveLocaleRoot(document.documentElement.lang);

    if (documentLocale) {
      return documentLocale;
    }
  }

  if (typeof navigator !== "undefined") {
    return resolveLocaleRoot(navigator.language);
  }

  return "es";
};

const messages = {
  en: {
    addToCartSuccess: "Product added to cart.",
    createCartSessionFailed: "Unable to create the cart session.",
    cartItemRemoved: "Product removed from cart.",
    genericError: "Something went wrong.",
    quantityMinimum: "Quantity must be at least 1.",
    productReviewCreated: "Review submitted successfully.",
    homeBreadcrumb: "Home /",
    asLowAs: "As low as",
  },
  es: {
    addToCartSuccess: "Producto agregado al carrito.",
    createCartSessionFailed: "No se pudo crear la sesion del carrito.",
    cartItemRemoved: "Producto eliminado del carrito.",
    genericError: "Ocurrio un error.",
    quantityMinimum: "La cantidad minima es 1.",
    productReviewCreated: "Reseña enviada correctamente.",
    homeBreadcrumb: "Inicio /",
    asLowAs: "Desde",
  },
} as const;

type LocaleRoot = keyof typeof messages;
export type StorefrontCopyKey = keyof (typeof messages)["es"];

export const getStorefrontCopy = (
  key: StorefrontCopyKey,
  locale?: string | null,
) => {
  const localeRoot = resolveLocaleRoot(locale) as LocaleRoot;

  return messages[localeRoot]?.[key] ?? messages.es[key];
};
