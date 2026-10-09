"use client";
import { Price } from "@/components/theme/ui/Price";
import { Rating } from "@/components/common/Rating";
import { AddToCart } from "@/components/cart/AddToCart";
import { VariantSelector } from "./VariantSelector";
import { ProductMoreDetails } from "./ProductMoreDetail";
import { useMemo, useState } from "react";
import { getVariantInfo } from "@utils/hooks/useVariantInfo";
import { useSearchParams } from "next/navigation";
import Prose from "@components/theme/search/Prose";
import { ProductData, ProductReviewNode } from "../type";
import {
  extractNumericId,
  safeCurrencyCode,
  safePriceValue,
  safeParse,
} from "@utils/helper";
import Link from "next/link";
import { buildProductWhatsAppUrl, TenantWhatsAppConfig } from "@/utils/whatsapp";
import CodQuickCheckout from "@/components/cod/CodQuickCheckout";
import { detectClientLocaleRoot, getStorefrontCopy } from "@/utils/storefront-copy";
import {
  resolveProductPurchaseState,
  SOLD_OUT_WHATSAPP_HELPER,
} from "@/utils/product-commerce";

export function ProductDescription({
  product,
  slug,
  reviews,
  totalReview,
  productSwatchReview,
  tenantWhatsApp,
}: {
  product: ProductData;
  slug: string;
  reviews: ProductReviewNode[];
  totalReview: number;
  productSwatchReview: any;
  tenantWhatsApp: TenantWhatsAppConfig | null;
}) {
  const priceValue = safePriceValue(product);
  const currencyCode = safeCurrencyCode(product);
  const configurableProductIndexData =
    safeParse<Record<string, Record<string, number>>>(
      productSwatchReview?.combinations
    ) || {};
  const searchParams = useSearchParams();
  const [userInteracted, setUserInteracted] = useState(false);
  const localeRoot = detectClientLocaleRoot();
  const allowsCheckout = tenantWhatsApp?.allowsCheckout !== false;

  const superAttributes = productSwatchReview?.superAttributeOptions
    ? safeParse(productSwatchReview.superAttributeOptions)
    : productSwatchReview?.superAttributes || [];

  const variantInfo = getVariantInfo(
    product?.type === "configurable",
    searchParams.toString(),
    superAttributes,
    productSwatchReview?.combinations
  );
  const selectedVariantId = variantInfo?.productid
    ? String(variantInfo.productid)
    : null;
  const purchaseState = useMemo(
    () => resolveProductPurchaseState(product, selectedVariantId),
    [product, selectedVariantId],
  );

  const additionalData = productSwatchReview?.attributeValues || [];
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const codProductId = useMemo(() => {
    const fromProduct = extractNumericId(String(product?.id || ""));
    if (fromProduct) {
      return Number(fromProduct);
    }

    const fromSwatch = extractNumericId(String(productSwatchReview?.id || ""));
    if (fromSwatch) {
      return Number(fromSwatch);
    }

    return null;
  }, [product?.id, productSwatchReview?.id]);

  const handleReviewClick = () => {
    setExpandedKeys(new Set(["2"]));
  };

  const whatsappProductUrl = useMemo(() => {
    const productPath = `/product/${(slug || "").replace(/^\/+/, "")}`;
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    return buildProductWhatsAppUrl(tenantWhatsApp, {
      productName: product?.name || "Producto",
      productPath,
      origin,
    });
  }, [tenantWhatsApp, product?.name, slug]);

  return (
    <>
      <div className="mb-2 flex flex-col pb-6">
        <div className="hidden lg:flex flex-col gap-3 shrink-0 mb-2">
          <Link
            href="/"
            className="w-fit text-sm font-medium text-nowrap relative text-neutral-500 before:absolute before:bottom-0 before:left-0 before:h-px before:w-0 before:bg-current before:transition-all before:duration-300 before:content-[''] hover:text-black hover:before:w-full dark:text-neutral-400 dark:hover:text-neutral-300"
          >
            {getStorefrontCopy("homeBreadcrumb", localeRoot)}
          </Link>
        </div>
        <h1 className="font-outfit text-2xl md:text-3xl lg:text-4xl font-semibold">
          {product?.name || ""}
        </h1>

        <div className="flex w-auto justify-between items-baseline gap-y-2 py-4 xs:flex-row xs:gap-y-0 sm:py-6 flex-wrap">
          <div className="flex gap-4 items-baseline">
            {product?.type === "configurable" && (
              <p className="text-base text-gray-600 dark:text-gray-400">
                {getStorefrontCopy("asLowAs", localeRoot)}
              </p>
            )}
            <Price
              amount={String(priceValue)}
              currencyCode={currencyCode}
              className="font-outfit text-xl md:text-2xl font-semibold"
            />
          </div>

          <Rating
            length={5}
            star={reviews[0]?.rating ?? 0}
            reviewCount={totalReview}
            className="mt-2"
            onReviewClick={handleReviewClick}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
              purchaseState.isSaleable
                ? "bg-neutral-100 text-neutral-900"
                : "bg-neutral-900 text-white"
            }`}
          >
            {purchaseState.statusLabel}
          </span>
          <p className="text-sm text-neutral-600">
            {purchaseState.showWhatsAppCta
              ? "Producto agotado por ahora."
              : purchaseState.isSaleable
                ? allowsCheckout
                  ? "Disponible para compra."
                  : "Disponible para pedir por WhatsApp."
                : "Este producto no está disponible en este momento."}
          </p>
        </div>
      </div>

      <div className="rounded-[32px] border border-neutral-200 bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.04)] md:p-6 lg:p-7">
        <div className="space-y-5">
          <VariantSelector
            variants={variantInfo?.variantAttributes}
            setUserInteracted={setUserInteracted}
            possibleOptions={variantInfo.possibleOptions}
          />

          <div
            className={
              variantInfo?.variantAttributes?.length
                ? "border-t border-neutral-200 pt-5"
                : ""
            }
          >
            <AddToCart
              index={configurableProductIndexData}
              productId={product?.id || ""}
              productSwatchReview={productSwatchReview}
              userInteracted={userInteracted}
              whatsappUrl={whatsappProductUrl}
              isSaleable={purchaseState.isSaleable}
              allowsCheckout={allowsCheckout}
              showSoldOutWhatsappCta={purchaseState.showWhatsAppCta}
              soldOutWhatsappUrl={purchaseState.whatsappUrl}
              soldOutHelperText={SOLD_OUT_WHATSAPP_HELPER}
            />
          </div>

          {Number.isFinite(codProductId) && codProductId && (
            <div className="border-t border-neutral-200 pt-5">
              <CodQuickCheckout productId={codProductId} />
            </div>
          )}
        </div>
      </div>

      {product?.shortDescription ? (
        <Prose
          className="mb-6 mt-6 text-base font-light text-selected-black dark:text-white"
          html={product.shortDescription}
        />
      ) : null}

      <ProductMoreDetails
        additionalData={additionalData}
        description={product?.description ?? ""}
        reviews={Array.isArray(reviews) ? reviews : []}
        totalReview={totalReview}
        productId={product?.id ?? ""}
        expandedKeys={expandedKeys}
        setExpandedKeys={setExpandedKeys}
      />
    </>
  );
}
