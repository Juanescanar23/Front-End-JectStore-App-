import { GET_RELATED_PRODUCTS, graphqlRequest } from "@/graphql";
import { ProductsSection } from "./ProductsSection";
import { SingleProductResponse } from "@/app/(public)/product/[...urlProduct]/page";
import { buildStorefrontFilterInput } from "@/utils/storefront-filters";

export async function RelatedProductsSection({
  fullPath,
}: {
  fullPath: string;
}) {
    async function getRelatedProduct(urlKey: string) {
      try {
        const input = buildStorefrontFilterInput({
          base: {
            page: 1,
            limit: 1,
            url_key: urlKey,
          },
        });

        const dataById = await graphqlRequest<SingleProductResponse>(
          GET_RELATED_PRODUCTS,
          {
            input,
          },
          {
            tags: ["related-products", `product-${urlKey}`],
            life: "hours",
          }
        );
    
        return dataById?.products?.data?.[0] || null;
      } catch (error) {
        if (error instanceof Error) {
          console.error("Error fetching product:", {
            message: error.message,
            urlKey,
            graphQLErrors: (error as unknown as Record<string, unknown>)
              .graphQLErrors,
          });
        }
        return null;
      }
    }

    const fetchRelatedProducts = await getRelatedProduct(fullPath);

    const relatedProducts = Array.isArray(fetchRelatedProducts?.relatedProducts)
    ? fetchRelatedProducts.relatedProducts
    : [];
  return (
    <ProductsSection
      title="Productos relacionados"
      description="Descubre las últimas tendencias. Productos recién agregados: nuevas tendencias, tecnología y esenciales antes de que se agoten."
      products={relatedProducts}
    />
  );
}
