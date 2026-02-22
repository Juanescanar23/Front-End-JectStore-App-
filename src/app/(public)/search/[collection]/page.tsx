import { Metadata } from "next";
import { notFound } from "next/navigation";
import { isArray } from "@/utils/type-guards";
import Grid from "@components/theme/ui/grid/Grid";
import FilterList from "@components/theme/filters/FilterList";
import SortOrder from "@components/theme/filters/SortOrder";
import MobileFilter from "@components/theme/filters/MobileFilter";
import ProductGridItems from "@components/catalog/product/ProductGridItems";
import Pagination from "@components/catalog/Pagination";
import {
  ProductFilterAttributeResponse,
  ProductsResponse,
} from "@components/catalog/type";
import {
  GET_FILTER_OPTIONS,
  GET_FILTER_PRODUCTS,
  GET_TREE_CATEGORIES,
  graphqlRequest,
} from "@/graphql";
import { SortByFields } from "@utils/constants";
import { CategoryDetail } from "@components/theme/search/CategoryDetail";
import { Suspense } from "react";
import FilterListSkeleton from "@components/common/skeleton/FilterSkeleton";
import { TreeCategoriesResponse } from "@/types/theme/category-tree";
import { MobileSearchBar } from "@components/layout/navbar/MobileSearch";
import { extractNumericId, findCategoryBySlug } from "@utils/helper";
import {
  buildStorefrontFilterInput,
  resolveSortToStorefrontFilters,
} from "@/utils/storefront-filters";
import { pickTranslationByLocale } from "@/utils/theme-translation";
import { getStorefrontLocaleCode } from "@/utils/server/storefront-locale";


export async function generateMetadata({
  params,
}: {
  params: Promise<{ collection: string }>;
}): Promise<Metadata> {
  const { collection: categorySlug } = await params;

  const treeData = await graphqlRequest<TreeCategoriesResponse>(
    GET_TREE_CATEGORIES,
    { getCategoryTree: true },
    { tags: ["categories"], life: "hours" }
  );

  const categories = treeData?.homeCategories || [];
  const categoryItem = findCategoryBySlug(categories, categorySlug);

  if (!categoryItem) return notFound();

  return {
    title: categoryItem.metaTitle || categoryItem.name,
    description: categoryItem.description || `${categoryItem.name} productos`,
  };
}

export default async function CategoryPage({
  searchParams,
  params,
}: {
  params: Promise<{ collection: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { collection: categorySlug } = await params;
  const resolvedParams = await searchParams;
  const localeCode = await getStorefrontLocaleCode();

  const [treeData, filterOptionsData] = await Promise.all([
    graphqlRequest<TreeCategoriesResponse>(
      GET_TREE_CATEGORIES,
      { getCategoryTree: true },
      { tags: ["categories"], life: "hours" }
    ),
    graphqlRequest<ProductFilterAttributeResponse>(
      GET_FILTER_OPTIONS,
      { categorySlug },
      {
        tags: ["products", "categories"],
        life: "hours",
      }
    ),
  ]);

  const categories = treeData?.homeCategories || [];
  const categoryItem = findCategoryBySlug(categories, categorySlug);

  if (!categoryItem) return notFound();

  const numericId = extractNumericId(categoryItem.id);

  const {
    q: searchValue,
    page,
    sort,
  } = (resolvedParams || {}) as {
    [key: string]: string;
  };

  const itemsPerPage = 12;
  const parsedPage = page ? parseInt(page, 10) : 1;
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const input = buildStorefrontFilterInput({
    base: {
        page: currentPage,
        limit: itemsPerPage,
        ...(searchValue ? { name: searchValue } : {}),
      ...(numericId ? { category_id: numericId } : {}),
      ...resolveSortToStorefrontFilters(sort),
    },
    searchParams: resolvedParams || {},
  });

  const data = await graphqlRequest<ProductsResponse>(
    GET_FILTER_PRODUCTS,
    { input },
    {
      tags: ["products", "categories", `category-${categorySlug}`],
      life: "minutes",
    }
  );

  const filterAttributes = (
    filterOptionsData?.getFilterAttribute?.filterAttributes || []
  ).map((attr: any) => ({
      id: attr.id,
      code: attr.code,
      adminName: attr.adminName || attr.code.toUpperCase(),
      options: (attr.options || []).map((o: any) => {
        const translation = pickTranslationByLocale<{ label?: string; locale?: string }>(
          o.translations,
          localeCode
        );
        return {
          id: o.id,
          adminName: translation?.label || o.adminName,
        };
      }),
    }));

  const products = data?.products?.data || [];
  const pageInfo = data?.products?.paginatorInfo;
  const totalCount = pageInfo?.total || products.length;

  return (
    <>
      <MobileSearchBar />
      <section>
        <Suspense fallback={<FilterListSkeleton />}>
          <CategoryDetail
            categoryItem={{ description: categoryItem.description ?? "", name: categoryItem.name ?? "" }}
          />
        </Suspense>
        <div className="my-10 hidden gap-4 md:flex md:items-baseline md:justify-between w-full max-w-screen-2xl mx-auto px-4">
          <FilterList filterAttributes={filterAttributes} />
          <SortOrder sortOrders={SortByFields} title="Ordenar por" />
        </div>
        <div className="flex items-center justify-between gap-4 py-8 md:hidden w-full max-w-screen-2xl mx-auto px-4">
          <MobileFilter filterAttributes={filterAttributes} />
          <SortOrder sortOrders={SortByFields} title="Ordenar por" />
        </div>

        {isArray(products) && products.length > 0 ? (
          <Grid className="grid-cols-2 lg:grid-cols-4 gap-5 md:gap-11.5 w-full max-w-screen-2xl mx-auto px-4"
          >
            <ProductGridItems products={products} />
          </Grid>
        ) : (
          <div className="px-4">
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-300">
              <p className="text-neutral-500">
                No se encontraron productos en esta categoría.
              </p>
            </div>
          </div>
        )}

        {isArray(products) && totalCount > itemsPerPage && (
          <nav
            aria-label="Paginación de productos"
            className="my-10 block items-center sm:flex"
          >
            <Pagination
              itemsPerPage={itemsPerPage}
              itemsTotal={totalCount || 0}
              currentPage={currentPage - 1}
            />
          </nav>
        )}
      </section>
    </>
  );
}
