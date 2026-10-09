import { ProductCommerce, ProductNode } from "@/components/catalog/type";

export const SOLD_OUT_WHATSAPP_HELPER =
  "Este producto está agotado por ahora. Puedes escribirnos por WhatsApp para confirmar disponibilidad.";

type CommerceProductLike = {
  id?: string | null;
  isSaleable?: boolean | null;
  commerce?: ProductCommerce | null;
  variants?: ProductNode[] | null;
};

const resolveSoldOutCommerce = (
  product?: CommerceProductLike | null,
  fallback?: CommerceProductLike | null,
) => product?.commerce?.soldOut || fallback?.commerce?.soldOut || null;

export const resolveSelectedVariant = (
  product?: CommerceProductLike | null,
  selectedVariantId?: string | null,
) => {
  if (!product || !selectedVariantId || !Array.isArray(product.variants)) {
    return null;
  }

  return (
    product.variants.find(
      (variant) => String(variant?.id || "") === String(selectedVariantId),
    ) || null
  );
};

export function resolveProductPurchaseState(
  product?: CommerceProductLike | null,
  selectedVariantId?: string | null,
) {
  const selectedVariant = resolveSelectedVariant(product, selectedVariantId);
  const activeProduct = selectedVariant || product || null;
  const soldOutCommerce = resolveSoldOutCommerce(activeProduct, product);
  const isSaleable = activeProduct?.isSaleable !== false;
  const isSoldOut = !isSaleable;
  const showWhatsAppCta =
    isSoldOut &&
    soldOutCommerce?.showWhatsappCta === true &&
    Boolean(soldOutCommerce?.whatsappUrl);

  return {
    activeProduct,
    selectedVariant,
    isSaleable,
    isSoldOut,
    showWhatsAppCta,
    whatsappUrl: soldOutCommerce?.whatsappUrl || null,
    statusLabel: showWhatsAppCta
      ? "Agotado por ahora"
      : isSoldOut
        ? "Agotado"
        : "Disponible",
  };
}
