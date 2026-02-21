import { ProductData, ProductReviewNode } from "../type";
import { ProductDescription } from "./ProductDescription";
import { getProductWithSwatchAndReview } from "@/utils/hooks/getProductSwatchAndReview";
import { getTenantWhatsAppConfig } from "@/utils/server/tenant-whatsapp";

export default async function ProductInfo({
  product,
  slug,
  reviews,
  totalReview,
}: {
  product: ProductData;
  slug: string;
  reviews: ProductReviewNode[];
  totalReview: number;
}) {
  const [productSwatchReview, tenantWhatsApp] = await Promise.all([
    getProductWithSwatchAndReview(slug),
    getTenantWhatsAppConfig(),
  ]);

  return (
    <ProductDescription
      product={product}
      productSwatchReview={productSwatchReview}
      slug={slug}
      reviews={reviews}
      totalReview={totalReview}
      tenantWhatsApp={tenantWhatsApp}
    />
  );
}
