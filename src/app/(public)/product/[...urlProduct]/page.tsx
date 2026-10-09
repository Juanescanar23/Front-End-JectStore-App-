import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import {
  ProductDetailSkeleton,
  RelatedProductSkeleton,
} from "@/components/common/skeleton/ProductSkeleton";
import {
  BASE_SCHEMA_URL,
  getProductImageUrl,
  NOT_IMAGE,
  PRODUCT_TYPE,
} from "@/utils/constants";
import HeroCarousel from "@/components/common/slider/HeroCarousel";
import { GET_PRODUCT_BY_URL_KEY, graphqlRequest } from "@/graphql";
import { ProductNode, ProductsResponse } from "@/components/catalog/type";
import { RelatedProductsSection } from "@components/catalog/product/RelatedProductsSection";
import ProductInfo from "@components/catalog/product/ProductInfo";
import { MobileSearchBar } from "@components/layout/navbar/MobileSearch";
import { buildStorefrontFilterInput } from "@/utils/storefront-filters";

export const dynamic = "force-dynamic";

export interface SingleProductResponse {
  products: ProductsResponse["products"];
}

const normalizeImageUrl = (value?: string | null) => {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return value.startsWith("/") ? value : `/${value}`;
};

const toArray = <T,>(value?: T | T[] | null): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const pickPreferredImage = (image?: {
  originalImageUrl?: string | null;
  largeImageUrl?: string | null;
  mediumImageUrl?: string | null;
  smallImageUrl?: string | null;
} | null) =>
  image?.originalImageUrl ||
  image?.largeImageUrl ||
  image?.mediumImageUrl ||
  image?.smallImageUrl ||
  null;

const collectProductImageUrls = (product?: ProductNode | null): string[] => {
  if (!product) return [];

  const uniqueImages = new Set<string>();

  const addNormalized = (image?: string | null) => {
    const normalized = normalizeImageUrl(image);
    if (normalized) {
      uniqueImages.add(normalized);
    }
  };

  // Prefer explicit gallery images from the product payload.
  for (const image of toArray(product.images)) {
    addNormalized(image?.url);
    addNormalized(image?.imageUrl);
  }

  if (uniqueImages.size > 0) {
    return Array.from(uniqueImages);
  }

  for (const image of toArray(product.cacheGalleryImages)) {
    addNormalized(pickPreferredImage(image));
  }

  if (uniqueImages.size > 0) {
    return Array.from(uniqueImages);
  }

  for (const image of toArray(product.cacheBaseImage)) {
    addNormalized(pickPreferredImage(image));
  }

  if (uniqueImages.size > 0) {
    return Array.from(uniqueImages);
  }

  addNormalized(product.baseImageUrl);
  return Array.from(uniqueImages);
};

async function getSingleProduct(urlKey: string) {
  try {
    const input = buildStorefrontFilterInput({
      base: {
        page: 1,
        limit: 1,
        url_key: urlKey,
      },
    });

    const dataById = await graphqlRequest<SingleProductResponse>(
      GET_PRODUCT_BY_URL_KEY,
      {
        input,
      },
      {
        tags: ["products", `product-${urlKey}`],
        life: "hours",
      }
    );

    return dataById?.products?.data?.[0] || null;
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error fetching product:", {
        message: error.message,
        urlKey,
        graphQLErrors: (error as unknown as Record<string, unknown>)
          .graphQLErrors,
      });
    }
    return null;
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ urlProduct: string[] }>;
  searchParams: Promise<{ type: string }>;
}) {
  const { urlProduct } = await params;
  const fullPath = urlProduct.join("/");
  const product = await getSingleProduct(fullPath);

  if (!product) return notFound();

  if (product.urlKey && product.urlKey !== fullPath) {
    redirect(`/product/${product.urlKey}`);
  }

  const imageUrl = getProductImageUrl(product);
  const productImages = collectProductImageUrls(product).map((src) => ({
    src,
    altText: product?.name || "product image",
  }));

  const variantImages = Array.isArray(product?.variants)
    ? product.variants.flatMap((variant) =>
        collectProductImageUrls(variant).map((src) => ({
          src,
          altText: variant?.name || product?.name || "product image",
        }))
      )
    : [];

  const heroImages =
    variantImages.length > 0
      ? variantImages
      : productImages.length > 0
        ? productImages
        : [
            {
              src: imageUrl || NOT_IMAGE,
              altText: product?.name || "product image",
            },
          ];

  const productJsonLd = {
    "@context": BASE_SCHEMA_URL,
    "@type": PRODUCT_TYPE,
    name: product?.name,
    description: product?.description,
    sku: product?.sku,
  };

  const reviews = Array.isArray(product?.reviews) ? product.reviews : [];

  return (
    <>
      <MobileSearchBar />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd),
        }}
        type="application/ld+json"
      />
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-y-4 rounded-lg px-4 pb-0 pt-4 xss:px-7.5 sm:gap-y-6 md:py-7.5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,36rem)] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1.02fr)_minmax(460px,40rem)] xl:gap-14">
        <div className="h-full w-full min-w-0">
          <Suspense fallback={<ProductDetailSkeleton />}>
            <HeroCarousel images={heroImages} />
          </Suspense>
        </div>
        <div className="w-full min-w-0">
          <Suspense fallback={<ProductDetailSkeleton />}>
            <ProductInfo
              product={product}
              slug={fullPath}
              reviews={reviews}
              totalReview={reviews.length}
            />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<RelatedProductSkeleton />}>
        <RelatedProductsSection fullPath={fullPath} />
      </Suspense>
    </>
  );
}
