export type TenantWhatsAppConfig = {
  enabled: boolean;
  waBaseUrl: string | null;
  phoneE164: string | null;
};

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
