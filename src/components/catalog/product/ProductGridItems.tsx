import { getProductImageUrl } from "@/utils/constants";
import { ProductCard } from "./ProductCard";

export default function ProductGridItems({
  products,
}: {
  products: any;
}) {
  return products.map((product: any, index: number) => {
    const imageUrl = getProductImageUrl(product);
    const price = product?.price ?? "0";
    const specialPrice = product?.specialPrice ?? null;
    const currency = product?.priceHtml?.currencyCode || "USD";
    return (
      <ProductCard
        key={index}
        currency={currency}
        imageUrl={imageUrl || ""}
        price={String(price)}
        specialPrice={specialPrice ? String(specialPrice) : undefined}
        product={product}
      />
    );
  });
}
