import { SingleProductResponse } from "@/app/(public)/product/[...urlProduct]/page";
import { GET_PRODUCT_SWATCH_REVIEW, graphqlRequest } from "@/graphql";
import { buildStorefrontFilterInput } from "@/utils/storefront-filters";

const buildVariantIndexMap = (index: any[] | undefined) => {
  if (!Array.isArray(index)) return {};

  return index.reduce<Record<string, Record<string, number>>>((acc, item) => {
    const variantId = item?.id;
    const optionIds: Array<{
      attributeCode?: string;
      attributeOptionId?: string | number;
    }> = Array.isArray(item?.attributeOptionIds)
      ? item.attributeOptionIds
      : [];

    if (!variantId) return acc;

    const mapped = optionIds.reduce(
      (map: Record<string, number>, option) => {
        if (!option?.attributeCode || option?.attributeOptionId === undefined) {
          return map;
        }

        map[String(option.attributeCode)] = Number(option.attributeOptionId);

        return map;
      },
      {} as Record<string, number>
    );

    acc[String(variantId)] = mapped;
    return acc;
  }, {});
};

export async function getProductWithSwatchAndReview(urlKey: string) {
  try {
    const input = buildStorefrontFilterInput({
      base: {
        page: 1,
        limit: 1,
        url_key: urlKey,
      },
    });

    const dataById = await graphqlRequest<SingleProductResponse>(
      GET_PRODUCT_SWATCH_REVIEW,
      { input },
      {
        tags: ["swatch-and-reviews", `product-${urlKey}`],
        life: "hours",
      }
    );

    const product = dataById?.products?.data?.[0];
    if (!product) return null;
    const productWithConfigurableData = product as any;

    return {
      ...product,
      combinations: buildVariantIndexMap(
        productWithConfigurableData?.configutableData?.index
      ),
    };
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
