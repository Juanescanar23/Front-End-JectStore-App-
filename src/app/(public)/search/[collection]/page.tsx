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


export async function generateMetadata({
  params,
}: {
  params: Promise<{ collection: string }>;
}): Promise<Metadata> {
  const { collection: categorySlug } = await params;

  const treeData = await graphqlRequest<TreeCategoriesResponse>(
    GET_TREE_CATEGORIES,
    { getCategoryTree: true },
    { tags: ["categories"], life: "days" }
  );

  const categories = treeData?.homeCategories || [];
  const categoryItem = findCategoryBySlug(categories, categorySlug);

  if (!categoryItem) return notFound();

  return {
    title: categoryItem.metaTitle || categoryItem.name,
    description: categoryItem.description || `${categoryItem.name} products`,
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

  const [treeData, colorFilterData, sizeFilterData, brandFilterData] = await Promise.all([
    graphqlRequest<TreeCategoriesResponse>(
      GET_TREE_CATEGORIES,
      { getCategoryTree: true },
      { tags: ["categories"], life: "days" }
    ),
    graphqlRequest<ProductFilterAttributeResponse>(GET_FILTER_OPTIONS, { id: "23", locale: "en" }),
    graphqlRequest<ProductFilterAttributeResponse>(GET_FILTER_OPTIONS, { id: "24", locale: "en" }),
    graphqlRequest<ProductFilterAttributeResponse>(GET_FILTER_OPTIONS, { id: "25", locale: "en" }),
  ]);

  const categories = treeData?.homeCategories || [];
  const categoryItem = findCategoryBySlug(categories, categorySlug);

  if (!categoryItem) return notFound();

  const numericId = extractNumericId(categoryItem.id);

  const {
    q: searchValue,
    page,
  } = (resolvedParams || {}) as {
    [key: string]: string;
  };

  const itemsPerPage = 12;
  const parsedPage = page ? parseInt(page, 10) : 1;
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [data] = await Promise.all([
    graphqlRequest<ProductsResponse>(GET_FILTER_PRODUCTS, {
      input: {
        page: currentPage,
        limit: itemsPerPage,
        ...(searchValue ? { name: searchValue } : {}),
      },
    }),
  ]);

  const filterAttributes = [
    colorFilterData?.attribute,
    sizeFilterData?.attribute,
    brandFilterData?.attribute,
  ]
    .filter(Boolean)
    .map((attr) => ({
      id: attr.id,
      code: attr.code,
      adminName: attr.code.toUpperCase(),
      options: (attr.options || []).map((o) => {
        const translation =
          o.translations?.find((t) => t.locale === "en") ||
          o.translations?.[0];
        return {
          id: o.id,
          adminName: translation?.label || o.adminName,
        };
      }),
    }));

  const products = data?.products?.data || [];
  const pageInfo = data?.products?.paginatorInfo;
  const totalCount = pageInfo?.total || products.length;
  const categoryId = numericId || categoryItem.id;
  const filteredProducts = categoryId
    ? products.filter((product) =>
      (product.categories || []).some(
        (category) => String(category?.id) === String(categoryId)
      )
    )
    : products;
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
          <SortOrder sortOrders={SortByFields} title="Sort by" />
        </div>
        <div className="flex items-center justify-between gap-4 py-8 md:hidden w-full max-w-screen-2xl mx-auto px-4">
          <MobileFilter filterAttributes={filterAttributes} />
          <SortOrder sortOrders={SortByFields} title="Sort by" />
        </div>

        {isArray(filteredProducts) && filteredProducts.length > 0 ? (
          <Grid className="grid-cols-2 lg:grid-cols-4 gap-5 md:gap-11.5 w-full max-w-screen-2xl mx-auto px-4"
          >
            <ProductGridItems products={filteredProducts} />
          </Grid>
        ) : (
          <div className="px-4">
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-300">
              <p className="text-neutral-500">No products found in this category.</p>
            </div>
          </div>
        )}

        {isArray(filteredProducts) && totalCount > itemsPerPage && (
          <nav
            aria-label="Collection pagination"
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
