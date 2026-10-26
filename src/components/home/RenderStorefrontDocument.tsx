import { Suspense } from "react";
import ImageCarousel from "./ImageCarousel";
import ProductCarousel from "./ProductCarousel";
import CategoryCarousel from "./CategoryCarousel";
import { MobileSearchBar } from "@/components/layout/navbar/MobileSearch";
import { CategoryCarouselSkeleton } from "@/components/common/skeleton/CategoryCarouselSkeleton";
import type { NextStorefrontDocument } from "@/lib/storefront-experience/document";

/** Preview and publication share the same renderer, with no preset substitution. */
export default function RenderStorefrontDocument({ document, currency }: { document: NextStorefrontDocument; currency: string }) {
  return (
    <>
      <MobileSearchBar />
      <section className="w-full max-w-screen-2xl mx-auto pb-4 px-4 xss:px-7.5">
        {document.sections.map((section) => {
          if (!section.visible) return null;
          let content;
          switch (section.type) {
            case "image_carousel":
              content = <ImageCarousel options={section.settings} editorial />;
              break;
            case "product_carousel":
              content = <ProductCarousel options={section.settings} layout={section.settings.layout} currency={currency} itemCount={section.settings.layout === "three-item" ? 3 : 4} />;
              break;
            case "category_carousel":
              content = (
                <Suspense fallback={<CategoryCarouselSkeleton />}>
                  <CategoryCarousel options={{}} editorial={section.settings} />
                </Suspense>
              );
              break;
          }
          return <div key={section.id} className="contents" data-storefront-section-id={section.id}>{content}</div>;
        })}
      </section>
    </>
  );
}
