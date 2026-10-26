import { ComponentProps, FC } from "react";
import { graphqlRequestNoCache } from "../../lib/graphql-fetch";
import { GET_PRODUCTS } from "@/graphql/catelog/queries/Product";
import { ThreeItemGrid } from "./ThreeItemGrid";
import Theme from "./ProductCarouselTheme";
import {
  buildStorefrontFilterInput,
  resolveSortToStorefrontFilters,
} from "@/utils/storefront-filters";
import { ProductsResponse } from "@/components/catalog/type";
import { getStorefrontCurrencyCode } from "@/utils/server/storefront-currency";


interface ProductCarouselProps {
    options: {
        title?: string;
        description?: string;
        filters: Record<string, any>;
    };
    itemCount?: number;
    sortOrder?: number;
    layout?: "three-item" | "grid";
    currency?: string;
}

const ProductCarousel: FC<ProductCarouselProps> = async ({ options, itemCount = 4, sortOrder, layout, currency }) => {
    const { filters, title } = options;
    let currencyCode = currency;
    let products: Array<ComponentProps<typeof ThreeItemGrid>["products"][number] & { sku: string }> = [];

    try {
        const normalizedFilters = Array.isArray(filters)
            ? filters.reduce<Record<string, string>>((acc, item) => {
                if (item?.key) {
                    acc[item.key] = String(item.value ?? "");
                }
                return acc;
            }, {})
            : (filters || {});

        const { sort, limit, ...rest } = normalizedFilters as Record<string, any>;
        const parsedLimit = Number.parseInt(String(limit), 10);

        const input = buildStorefrontFilterInput({
            base: {
            page: 1,
            limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : itemCount,
            ...(layout && ["name", "price", "created_at"].includes(String(sort))
              ? { sort }
              : resolveSortToStorefrontFilters(typeof sort === "string" ? sort : undefined)),
            ...rest,
          },
        });

        const data = await graphqlRequestNoCache<ProductsResponse>(
            GET_PRODUCTS,
            { input }
        );

        products = (data?.products?.data || [])
          .slice(0, 8)
          .map((product) => ({
            id: product.id,
            sku: product.sku,
            name: product.name || product.sku,
            urlKey: product.urlKey || product.sku,
            baseImageUrl: product.baseImageUrl ?? undefined,
            images: Array.isArray(product.images) ? product.images : undefined,
            cacheBaseImage: Array.isArray(product.cacheBaseImage)
              ? product.cacheBaseImage
              : product.cacheBaseImage
                ? [product.cacheBaseImage]
                : undefined,
            price: product.price ?? "0",
            specialPrice: product.specialPrice ?? undefined,
            isSaleable: product.isSaleable,
            type: product.type || "simple",
          }));
        if (products.length) {
          currencyCode ||= await getStorefrontCurrencyCode();
          if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("The channel currency is unavailable.");
        }
    } catch (error) {
        console.error("Error fetching products for carousel:", {
            title,
            filters,
            error: error instanceof Error ? error.message : error
        });
        return null;
    }

        if (!products.length || !currencyCode) {
            return null;
        }

        const description = options.description ?? "Descubre las últimas tendencias. Productos recién agregados: nuevas tendencias, tecnología y esenciales antes de que se agoten.";
        if ((layout === "three-item" || !layout && sortOrder === 2) && products.length >= 3) {
            return (
                <ThreeItemGrid
                    title={title || "Productos"}
                    currency={currencyCode}
                    description={description}
                    products={products.slice(0, 3)}
                />
            );
        }

        return (

            <Theme
                title={title || "Productos"}
                currency={currencyCode}
                description={description}
                products={products}
            />
        );
};

export default ProductCarousel;
