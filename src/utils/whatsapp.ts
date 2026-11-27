export type TenantWhatsAppConfig = {
  enabled: boolean;
  allowsCheckout: boolean;
  waBaseUrl: string | null;
  phoneE164: string | null;
  places: { floating: boolean; inquiry: boolean; purchase: boolean };
  labels: { floating: string; inquiry: string; purchase: string };
  cartOrder: boolean;
};

/** New fields are additive: an older API keeps its existing button locations. */
export function parseTenantWhatsAppConfig(input: unknown): TenantWhatsAppConfig {
  const payload = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const places = payload.places && typeof payload.places === "object" ? payload.places as Record<string, unknown> : {};
  const labels = payload.labels && typeof payload.labels === "object" ? payload.labels as Record<string, unknown> : {};
  const enabled = payload.enabled === true;
  const text = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim().slice(0, 40) : fallback;
  return {
    enabled,
    allowsCheckout: payload.allows_checkout !== false,
    waBaseUrl: typeof payload.wa_base_url === "string" && payload.wa_base_url.trim() ? payload.wa_base_url : null,
    phoneE164: typeof payload.phone_e164 === "string" && payload.phone_e164.trim() ? payload.phone_e164 : null,
    places: {
      floating: enabled && places.floating !== false,
      inquiry: enabled && places.inquiry !== false,
      purchase: enabled && places.purchase !== false,
    },
    labels: {
      floating: text(labels.floating, "WhatsApp"),
      inquiry: text(labels.inquiry, "Consultar por WhatsApp"),
      purchase: text(labels.purchase, "Pedir por WhatsApp"),
    },
    // Read the flag only. Creating an order at checkout awaits the design audit.
    cartOrder: enabled && payload.cart_order === true,
  };
}

const normalizeUrlPath = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

export function buildProductWhatsAppUrl(
  config: TenantWhatsAppConfig | null | undefined,
  options: {
    productName?: string | null;
    productPath?: string | null;
    origin?: string | null;
  },
): string | null {
  if (!config?.enabled || !config.waBaseUrl) {
    return null;
  }

  const safeName = (options.productName || "este producto").trim();
  const normalizedPath = normalizeUrlPath(options.productPath || "");
  const normalizedOrigin = (options.origin || "").trim().replace(/\/+$/, "");
  const fullProductUrl =
    normalizedOrigin && normalizedPath
      ? `${normalizedOrigin}${normalizedPath}`
      : normalizedPath;

  const messageParts = [
    `Hola, estoy interesado en: ${safeName}.`,
  ];

  if (fullProductUrl) {
    messageParts.push(`Link: ${fullProductUrl}`);
  }

  const message = messageParts.join(" ");

  try {
    const waUrl = new URL(config.waBaseUrl);
    waUrl.searchParams.set("text", message);
    return waUrl.toString();
  } catch {
    return `${config.waBaseUrl}?text=${encodeURIComponent(message)}`;
  }
}
