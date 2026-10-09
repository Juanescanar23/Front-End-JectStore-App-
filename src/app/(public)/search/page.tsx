import dynamicImport from "next/dynamic";
import Link from "next/link";
import Grid from "@/components/theme/ui/grid/Grid";
import NotFound from "@/components/theme/search/not-found";
import { isArray } from "@/utils/type-guards";
import {
  graphqlRequest,
} from "@/graphql";
import { GET_PRODUCTS } from "@/graphql";
import { generateMetadataForPage } from "@/utils/helper";
import SortOrder from "@/components/theme/filters/SortOrder";
import { SortByFields } from "@/utils/constants";
import MobileFilter from "@/components/theme/filters/MobileFilter";
import FilterList from "@/components/theme/filters/FilterList";
import {
  ProductsResponse,
} from "@/components/catalog/type";
import { MobileSearchBar } from "@components/layout/navbar/MobileSearch";
import {
  buildStorefrontFilterInput,
  resolveSortToStorefrontFilters,
} from "@/utils/storefront-filters";
import { getRequestBaseUrl } from "@/utils/server/request-base-url";
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
  const baseUrl = await getRequestBaseUrl();

  return generateMetadataForPage("search", {
    title: searchQuery ? `Búsqueda: ${searchQuery}` : "Buscar productos",
    description: searchQuery
      ? `Resultados de búsqueda para "${searchQuery}"`
      : "Busca productos en nuestra tienda",
    image: "/search-og.jpg",
    baseUrl: baseUrl ?? undefined,
  });
}

function SearchFallback({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pb-24 lg:pt-14">
      <div className="rounded-[32px] border border-neutral-200 bg-white px-6 py-12 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:px-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
          Catálogo
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-neutral-950 sm:text-4xl">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-neutral-600 sm:text-base">
          {description}
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-neutral-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          Volver al inicio
        </Link>
      </div>
    </section>
  );
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
    sort,
  } = (params || {}) as {
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
      ...resolveSortToStorefrontFilters(sort),
    },
    searchParams: params || {},
  });

  let data: ProductsResponse | null = null;

  try {
    data = await graphqlRequest<ProductsResponse>(
      GET_PRODUCTS,
      { input },
      {
        tags: ["products"],
        life: "minutes",
      }
    );
  } catch (error) {
    console.error("Unable to resolve storefront search page:", error);

    return (
      <SearchFallback
        title="No pudimos cargar el catálogo"
        description="La búsqueda del tenant no está disponible temporalmente. Puedes volver al inicio e intentarlo de nuevo en unos minutos."
      />
    );
  }

  const filterAttributes: Array<{
    id: string;
    code: string;
    adminName: string;
    options: Array<{ id: string; adminName: string }>;
  }> = [];

  const products = data?.products?.data || [];
  const pageInfo = data?.products?.paginatorInfo;
  const totalCount = pageInfo?.total || products.length;

  return (
    <>

      <MobileSearchBar />
      <h2 className="text-2xl sm:text-4xl font-semibold mx-auto mt-7.5 w-full max-w-screen-2xl my-3 mx-auto px-4 xss:px-7.5">
        Todos los productos destacados
      </h2>

      <div className="my-10 hidden gap-4 md:flex md:items-baseline md:justify-between w-full mx-auto max-w-screen-2xl px-4 xss:px-7.5">
        <FilterList filterAttributes={filterAttributes} />

        <SortOrder sortOrders={SortByFields} title="Ordenar por" />
      </div>
      <div className="flex items-center justify-between gap-4 py-8 md:hidden  mx-auto w-full max-w-screen-2xl px-4 xss:px-7.5">
        <MobileFilter filterAttributes={filterAttributes} />

        <SortOrder sortOrders={SortByFields} title="Ordenar por" />
      </div>

      {!isArray(products) && (
        <NotFound
          msg={`${searchValue
            ? `No hay productos que coincidan con: ${searchValue}`
            : "No hay productos que coincidan"
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
          aria-label="Paginación de productos"
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
