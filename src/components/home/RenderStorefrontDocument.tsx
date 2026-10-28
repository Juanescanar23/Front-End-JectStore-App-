import { Suspense } from "react";
import ImageCarousel from "./ImageCarousel";
import ProductCarousel from "./ProductCarousel";
import CategoryCarousel from "./CategoryCarousel";
import { MobileSearchBar } from "@/components/layout/navbar/MobileSearch";
import { CategoryCarouselSkeleton } from "@/components/common/skeleton/CategoryCarouselSkeleton";
import type { NextStorefrontDocument } from "@/lib/storefront-experience/document";
import StoreIntro from "./StoreIntro";

/** Preview and publication share the same renderer, with no preset substitution. */
export default function RenderStorefrontDocument({ document, currency }: { document: NextStorefrontDocument; currency: string }) {
  const sections = document.sections.filter(section => section.visible);
  // Keep the incumbent container for catalogue-only documents. Intro sections
  // already own their spacing; grouping preserves order without double padding.
  const groups: Array<NextStorefrontDocument["sections"]> = [];
  for (const section of sections) {
    const last = groups.at(-1);
    if (section.type === "store_intro" || !last || last[0]?.type === "store_intro") groups.push([section]);
    else last.push(section);
  }
  const hasCatalogue = sections.some(section => section.type !== "store_intro");
  return (
    <>
      {(hasCatalogue || !sections.length) && <MobileSearchBar />}
      {groups.map(group => group[0].type === "store_intro" ? (
        <div key={group[0].id} className="contents" data-storefront-section-id={group[0].id}><StoreIntro settings={group[0].settings} /></div>
      ) : (
      <section key={group[0].id} className="w-full max-w-screen-2xl mx-auto pb-4 px-4 xss:px-7.5">
        {group.map((section) => {
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
      ))}
      {!sections.length && <section className="w-full max-w-screen-2xl mx-auto pb-4 px-4 xss:px-7.5" />}
    </>
  );
}
