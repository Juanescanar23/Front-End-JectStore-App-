import { FC } from "react";
import { graphqlRequest } from "../../lib/graphql-fetch";
import { GET_PRODUCTS } from "@/graphql/catelog/queries/Product";
import { ThreeItemGrid } from "./ThreeItemGrid";
import Theme from "./ProductCarouselTheme";


interface ProductCarouselProps {
    options: {
        title?: string;
        filters: Record<string, any>;
    };
    itemCount?: number;
    sortOrder?: number;
}

const ProductCarousel: FC<ProductCarouselProps> = async ({ options, itemCount = 4, sortOrder }) => {
    const { filters, title } = options;
    try {
        const normalizedFilters = Array.isArray(filters)
            ? filters.reduce<Record<string, string>>((acc, item) => {
                if (item?.key) {
                    acc[item.key] = String(item.value ?? "");
                }
                return acc;
            }, {})
            : (filters || {});

        const { sort: _sort, limit, ...rest } = normalizedFilters as Record<string, any>;
        const parsedLimit = Number.parseInt(String(limit), 10);
        const input: Record<string, any> = {
            page: 1,
            limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : itemCount,
        };
        Object.entries(rest).forEach(([key, value]) => {
            if (value === undefined || value === null || value === "") return;
            switch (key) {
                case "productId":
                case "attributeFamily":
                    {
                        const numericValue = Number(value);
                        if (Number.isFinite(numericValue)) {
                            input[key] = numericValue;
                        }
                    }
                    break;
                case "type":
                case "sku":
                case "name":
                case "channel":
                    input[key] = String(value);
                    break;
                default:
                    break;
            }
        });

        const data = await graphqlRequest<any>(
            GET_PRODUCTS,
            {
                input
            },
            {
                tags: ["products"],
                life: "days",
            }
        );

        const products =
            data?.products?.data?.slice(0, 8) || [];

        if (!products.length) {
            return null;
        }

        if (sortOrder === 2) {
            return (
                <ThreeItemGrid
                    title={title || "Productos"}
                    description="Descubre las últimas tendencias. Productos recién agregados: nuevas tendencias, tecnología y esenciales antes de que se agoten."
                    products={products.slice(0, 3)}
                />
            );
        }

        return (

            <Theme
                title={title || "Productos"}
                description="Descubre las últimas tendencias. Productos recién agregados: nuevas tendencias, tecnología y esenciales antes de que se agoten."
                products={products}
            />
        );
    } catch (error) {
        console.error("Error fetching products for carousel:", {
            title,
            filters,
            error: error instanceof Error ? error.message : error
        });
        return null;
    }
};

export default ProductCarousel;
