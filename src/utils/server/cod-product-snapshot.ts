import { CodProductSnapshot } from "@/types/cod";
import { GET_PRODUCT_COD_SNAPSHOT, graphqlRequestNoCache } from "@/graphql";
import { buildStorefrontFilterInput } from "@/utils/storefront-filters";

interface ProductSnapshotResponse {
  products?: {
    data?: Array<{
      id?: string | number;
      name?: string;
      type?: string;
      price?: string | number;
      specialPrice?: string | number;
      priceHtml?: {
        currencyCode?: string;
      };
      isSaleable?: boolean;
      baseImageUrl?: string | null;
      images?: Array<{ url?: string | null; imageUrl?: string | null }>;
      cacheBaseImage?:
        | Array<{
            smallImageUrl?: string | null;
            mediumImageUrl?: string | null;
            largeImageUrl?: string | null;
            originalImageUrl?: string | null;
          }>
        | {
            smallImageUrl?: string | null;
            mediumImageUrl?: string | null;
            largeImageUrl?: string | null;
            originalImageUrl?: string | null;
          }
        | null;
      superAttributes?: Array<{
        code?: string;
        adminName?: string;
        options?: Array<{
          id?: string | number;
          adminName?: string;
          label?: string;
        }>;
      }>;
      configutableData?: {
        index?: Array<{
          id?: string | number;
          attributeOptionIds?: Array<{
            attributeCode?: string;
            attributeOptionId?: string | number;
          }>;
        }>;
      };
    }>;
  };
}

const parseNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const toArray = <T,>(value?: T | T[] | null): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const normalizeImage = (value?: string | null) => {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return value.startsWith("/") ? value : `/${value}`;
};

const pickProductImage = (product: {
  baseImageUrl?: string | null;
  images?: Array<{ url?: string | null; imageUrl?: string | null }>;
  cacheBaseImage?:
    | Array<{
        smallImageUrl?: string | null;
        mediumImageUrl?: string | null;
        largeImageUrl?: string | null;
        originalImageUrl?: string | null;
      }>
    | {
        smallImageUrl?: string | null;
        mediumImageUrl?: string | null;
        largeImageUrl?: string | null;
        originalImageUrl?: string | null;
      }
    | null;
}) => {
  const images = toArray(product.images);
  for (const image of images) {
    const resolved = normalizeImage(image?.url || image?.imageUrl);
    if (resolved) return resolved;
  }

  const cacheBaseImage = toArray(product.cacheBaseImage);
  for (const image of cacheBaseImage) {
    const resolved = normalizeImage(
      image.originalImageUrl || image.largeImageUrl || image.mediumImageUrl || image.smallImageUrl,
    );
    if (resolved) return resolved;
  }

  return normalizeImage(product.baseImageUrl);
};

const buildVariantIndex = (
  index: Array<{
    id?: string | number;
    attributeOptionIds?: Array<{
      attributeCode?: string;
      attributeOptionId?: string | number;
    }>;
  }> | null | undefined,
) => {
  if (!Array.isArray(index)) {
    return {};
  }

  return index.reduce<Record<string, Record<string, number>>>((acc, item) => {
    if (!item?.id) {
      return acc;
    }

    const row = (Array.isArray(item.attributeOptionIds) ? item.attributeOptionIds : []).reduce<
      Record<string, number>
    >((map, attribute) => {
      if (!attribute?.attributeCode || attribute?.attributeOptionId === undefined) {
        return map;
      }

      const optionId = Number(attribute.attributeOptionId);
      if (!Number.isFinite(optionId)) {
        return map;
      }

      map[String(attribute.attributeCode)] = optionId;
      return map;
    }, {});

    acc[String(item.id)] = row;
    return acc;
  }, {});
};

async function fetchByFilter(productId: number, key: string) {
  const input = buildStorefrontFilterInput({
    base: {
      page: 1,
      limit: 1,
      [key]: productId,
    },
  });

  const result = await graphqlRequestNoCache<ProductSnapshotResponse>(
    GET_PRODUCT_COD_SNAPSHOT,
    { input },
  );

  return result?.products?.data?.[0] || null;
}

export async function getCodProductSnapshot(
  productId: number,
): Promise<CodProductSnapshot | null> {
  if (!Number.isFinite(productId) || productId <= 0) {
    return null;
  }

  let product = await fetchByFilter(productId, "id");

  if (!product) {
    product = await fetchByFilter(productId, "product_id");
  }

  if (!product) {
    return null;
  }

  const regular = parseNumber(product.price);
  const special = parseNumber(product.specialPrice);

  const finalPrice = special > 0 ? special : regular;
  const attributes = Array.isArray(product.superAttributes)
    ? product.superAttributes
        .filter((attribute) => typeof attribute?.code === "string" && attribute.code.trim() !== "")
        .map((attribute) => ({
          code: String(attribute.code),
          label:
            (typeof attribute.adminName === "string" && attribute.adminName.trim() !== ""
              ? attribute.adminName
              : attribute.code || "") || "",
          options: Array.isArray(attribute.options)
            ? attribute.options
                .filter((option) => option?.id !== undefined && option?.id !== null)
                .map((option) => ({
                  id: Number(option.id),
                  label:
                    (typeof option.label === "string" && option.label.trim() !== ""
                      ? option.label
                      : option.adminName || "") || "",
                }))
                .filter((option) => Number.isFinite(option.id))
            : [],
        }))
    : [];

  return {
    id: Number(product.id),
    title: String(product.name || "Producto"),
    image: pickProductImage(product),
    base_price: finalPrice,
    currency_code: product.priceHtml?.currencyCode || "USD",
    has_variants: attributes.length > 0,
    is_saleable: Boolean(product.isSaleable),
    type: product.type,
    attributes,
    variant_index: buildVariantIndex(product.configutableData?.index),
  };
}
