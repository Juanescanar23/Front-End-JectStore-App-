import { FC } from "react";
import Link from "next/link";
import { graphqlRequestNoCache } from "../../lib/graphql-fetch";
import { GET_HOME_CATEGORIES } from "@/graphql/catelog/queries/HomeCategories";
import { GET_TREE_CATEGORIES } from "@/graphql/catelog/queries/Category";
import { GridTileImage } from "../theme/ui/grid/Tile";
import { NOT_IMAGE } from "@/utils/constants";
import type { NextCategorySection } from "@/lib/storefront-experience/document";

interface CategoryCarouselProps {
  options: {
    filters?: Record<string, any>;
  };
  editorial?: NextCategorySection["settings"];
}

const CategoryCarousel: FC<CategoryCarouselProps> = async ({
  options: _options,
  editorial,
}) => {
  let topCategories: any[] = [];

  try {
    const data = await graphqlRequestNoCache<any>(
      editorial?.category_ids.length ? GET_TREE_CATEGORIES : GET_HOME_CATEGORIES,
      { getCategoryTree: true }
    );

    const categories = data?.homeCategories || [];

    topCategories = categories
      .filter((category: any) => category.id !== "1")
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
      .slice(0, 3);
    if (editorial?.category_ids.length) {
      const flatten = (items: any[]): any[] => items.flatMap((item) => [item, ...flatten(Array.isArray(item.children) ? item.children : [])]);
      const selectable = flatten(categories);
      topCategories = editorial.category_ids.flatMap((id) => {
        const category = selectable.find((item: any) => String(item.id) === String(id) && String(item.id) !== "1");
        return category ? [category] : [];
      });
    }
  } catch (error) {
    console.error("Error fetching categories:", error);
    return null;
  }

  if (!topCategories.length) return null;

    return (
      <section className="pt-8 sm:pt-12 lg:pt-20">
        <div className="md:max-w-4.5xl mx-auto mb-10 w-auto text-center md:px-36">
          <h2 className="mb-2 text-xl md:text-4xl  font-semibold">
            {editorial?.title ?? "Compra por categoría"}
          </h2>
          <p className="text-sm md:text-base font-normal text-black/60 dark:text-neutral-300">
            {editorial?.description ?? "Descubre las últimas tendencias. Productos recién agregados: nuevas tendencias, tecnología y esenciales antes de que se agoten."}
          </p>
        </div>
        <div className="w-full overflow-x-auto overflow-y-hidden">
          <ul className="m-0 grid grid-cols-1 gap-7 p-0 xss:grid-cols-2 sm:grid-cols-3">
            {topCategories.map((category: any) => (
              <li
                key={category.id}
                className="relative aspect-498/665 h-full w-full max-w-[498px] flex-none overflow-hidden rounded-[18px]"
              >
                <Link
                  className="relative h-full w-full"
                  href={`/search/${category.slug}`}
                  aria-label={`Comprar categoría ${category.name}`}
                >
                  <GridTileImage
                    fill
                    alt={`Imagen de la categoría ${category.name}`}
                    className={
                      "relative rounded-[18px] overflow-hidden object-cover transition duration-300 ease-in-out group-hover:scale-105"
                    }
                    label={{
                      title: category.name || "",
                      page: "category",
                      amount: "0",
                      currencyCode: "USD",
                    }}
                    src={category.logoUrl || category.bannerUrl || NOT_IMAGE}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
};

export default CategoryCarousel;
