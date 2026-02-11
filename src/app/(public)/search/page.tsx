import dynamicImport from "next/dynamic";
import Grid from "@/components/theme/ui/grid/Grid";
import NotFound from "@/components/theme/search/not-found";
import { isArray } from "@/utils/type-guards";
import {
  GET_FILTER_OPTIONS,
  graphqlRequest,
} from "@/graphql";
import { GET_PRODUCTS } from "@/graphql";
import { generateMetadataForPage } from "@/utils/helper";
import SortOrder from "@/components/theme/filters/SortOrder";
import { SortByFields } from "@/utils/constants";
import MobileFilter from "@/components/theme/filters/MobileFilter";
import FilterList from "@/components/theme/filters/FilterList";
import {
  ProductFilterAttributeResponse,
  ProductsResponse,
} from "@/components/catalog/type";
import { MobileSearchBar } from "@components/layout/navbar/MobileSearch";
const Pagination = dynamicImport(
  () => import("@/components/catalog/Pagination")
);
const ProductGridItems = dynamicImport(
  () => import("@/components/catalog/product/ProductGridItems")
);

export const dynamicParams = true;


export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const searchQuery = params?.q as string | undefined;

  return generateMetadataForPage("search", {
    title: searchQuery ? `Search: ${searchQuery}` : "Search Products",
    description: searchQuery
      ? `Search results for "${searchQuery}"`
      : "Search for products in our store",
    image: "/search-og.jpg",
  });
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const {
    q: searchValue,
    page,
  } = (params || {}) as {
    [key: string]: string;
  };

  const itemsPerPage = 12;
  const parsedPage = page ? parseInt(page, 10) : 1;
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const dataPromise = graphqlRequest<ProductsResponse>(GET_PRODUCTS, {
    input: {
      page: currentPage,
      limit: itemsPerPage,
      ...(searchValue ? { name: searchValue } : {}),
    },
  });

  const [data, colorFilterData, sizeFilterData, brandFilterData] = await Promise.all([
    dataPromise,
    graphqlRequest<ProductFilterAttributeResponse>(GET_FILTER_OPTIONS, {
      id: "23",
      locale: "en",
    }),
    graphqlRequest<ProductFilterAttributeResponse>(GET_FILTER_OPTIONS, {
      id: "24",
      locale: "en",
    }),
    graphqlRequest<ProductFilterAttributeResponse>(GET_FILTER_OPTIONS, {
      id: "25",
      locale: "en",
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

  return (
    <>

      <MobileSearchBar />
      <h2 className="text-2xl sm:text-4xl font-semibold mx-auto mt-7.5 w-full max-w-screen-2xl my-3 mx-auto px-4 xss:px-7.5">
        All Top Products
      </h2>

      <div className="my-10 hidden gap-4 md:flex md:items-baseline md:justify-between w-full mx-auto max-w-screen-2xl px-4 xss:px-7.5">
        <FilterList filterAttributes={filterAttributes} />

        <SortOrder sortOrders={SortByFields} title="Sort by" />
      </div>
      <div className="flex items-center justify-between gap-4 py-8 md:hidden  mx-auto w-full max-w-screen-2xl px-4 xss:px-7.5">
        <MobileFilter filterAttributes={filterAttributes} />

        <SortOrder sortOrders={SortByFields} title="Sort by" />
      </div>

      {!isArray(products) && (
        <NotFound
          msg={`${searchValue
            ? `There are no products that match Showing : ${searchValue}`
            : "There are no products that match Showing"
            } `}
        />
      )}
      {isArray(products) ? (
        <Grid
          className="grid grid-flow-row grid-cols-2 gap-5 md:gap-11.5 w-full max-w-screen-2xl mx-auto md:grid-cols-3 lg:grid-cols-4 px-4 xss:px-7.5"
        >
          <ProductGridItems products={products} />
        </Grid>
      ) : null}

      {isArray(products) && totalCount > itemsPerPage && (
        <nav
          aria-label="Collection pagination"
          className="my-10 block items-center sm:flex"
        >
          <Pagination
            itemsPerPage={itemsPerPage}
            itemsTotal={totalCount || 0}
            currentPage={(pageInfo?.currentPage ?? currentPage) - 1}
          />
        </nav>
      )}
    </>
  );
}
