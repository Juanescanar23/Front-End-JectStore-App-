import { Suspense } from "react";
import { safeParse } from "@utils/helper";
import { ThemeCustomizationResponse } from "@/types/theme/theme-customization";
import ImageCarousel from "./ImageCarousel";
import ProductCarousel from "./ProductCarousel";
import CategoryCarousel from "./CategoryCarousel";
import { MobileSearchBar } from "@components/layout/navbar/MobileSearch";
import { CategoryCarouselSkeleton } from "@components/common/skeleton/CategoryCarouselSkeleton";
import { pickTranslationByLocale } from "@/utils/theme-translation";
import { getStorefrontLocaleCode } from "@/utils/server/storefront-locale";

interface RenderThemeCustomizationProps {
    themeCustomizations: ThemeCustomizationResponse["themeCustomization"] | undefined;
    currency?: string;
}

const isEnabled = (status?: string | boolean | null) => {
    if (typeof status === "boolean") return status;
    if (typeof status === "string") return status !== "0";
    return true;
};

const RenderThemeCustomization = async ({
    themeCustomizations,
    currency,
}: RenderThemeCustomizationProps) => {
    if (!themeCustomizations?.length) return null;

    const localeCode = await getStorefrontLocaleCode();

    let productCarouselIndex = 0;

    const sortedThemes = [...themeCustomizations].sort((a, b) =>
        (a.sortOrder || 0) - (b.sortOrder || 0)
    );

    return (
        <>
            <MobileSearchBar />
            <section className="w-full max-w-screen-2xl mx-auto pb-4 px-4 xss:px-7.5">
                {sortedThemes.map((node) => {
                    if (!isEnabled(node.status)) return null;

                    const translation = pickTranslationByLocale(
                        node.translations,
                        localeCode
                    );
                    if (!translation) return null;

                    const options = safeParse(translation.options as any) || {};
                    if (Object.keys(options).length === 0) {
                        console.error("Error parsing options for", node.type);
                    }

                    switch (node.type) {
                        case "image_carousel":
                            return <ImageCarousel key={node.id} options={options as any} />;
                        case "product_carousel": {
                            productCarouselIndex++;
                            const opts = options as any;
                            const limit = opts?.filters?.limit ? parseInt(opts.filters.limit, 10) : undefined;
                            const itemCount = limit || (productCarouselIndex === 1 ? 3 : 4);
                            const sortOrder = typeof node?.sortOrder === "number" ? node.sortOrder : undefined;
                            return (
                                <ProductCarousel
                                    key={node.id}
                                    currency={currency}
                                    options={{ ...options, title: node.name } as any}
                                    itemCount={itemCount}
                                    sortOrder={productCarouselIndex === 1 ? 2 : sortOrder}
                                />
                            );
                        }
                        case "category_carousel":
                            return (
                                <Suspense key={node.id} fallback={<CategoryCarouselSkeleton />}>
                                    <CategoryCarousel options={options as any} />
                                </Suspense>
                            );
                        default:
                            return null;
                    }
                })}
            </section>
        </>
    );
};

export default RenderThemeCustomization;
