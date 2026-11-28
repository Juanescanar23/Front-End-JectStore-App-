export const WHATSAPP_ORDER_METHOD = "whatsapp_order";
export const WHATSAPP_ORDER_TITLE = "Pedir por WhatsApp";
export const WHATSAPP_RECEIPT_COOKIE = "jectstore_whatsapp_receipt";
export const WHATSAPP_RECEIPT_PATH = "/checkout/whatsapp-order";

export type WhatsAppOrder = {
  id: number;
  number: string;
  status: string;
  whatsappUrl: string | null;
};

export function isWhatsAppOrderId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647;
}

export function parseWhatsAppOrder(value: unknown): WhatsAppOrder | null {
  if (!value || typeof value !== "object") return null;
  const { id, number, status, whatsappUrl } = value as Record<string, unknown>;
  if (!isWhatsAppOrderId(id) || typeof number !== "string" || !number || typeof status !== "string") return null;

  let link = null;
  if (typeof whatsappUrl === "string" && whatsappUrl.length <= 2000) {
    try {
      const url = new URL(whatsappUrl);
      if (url.origin === "https://wa.me" && !url.username && !url.password && /^\/[1-9]\d{6,14}$/.test(url.pathname)) {
        link = url.href;
      }
    } catch {
      // An invalid link does not invalidate a persisted order.
    }
  }

  return { id, number, status, whatsappUrl: link };
}
