"use client";

import { CartCheckoutPageSkeleton } from "@/components/common/skeleton/CheckoutSkeleton";
import { useAppSelector } from "@/store/hooks";
import { CodCheckoutConfigResponse } from "@/types/cod";
import { fetchHandler } from "@utils/fetch-handler";
import { getCartToken } from "@utils/getCartToken";
import PaymentMethod from "./PaymentMethod";
import { useQueries, useQuery } from "@tanstack/react-query";
import { FC, useMemo } from "react";

const isCodMethod = (method: { method?: string; title?: string }) => {
  const rawMethod = String(method?.method || "").toLowerCase();
  const rawTitle = String(method?.title || "").toLowerCase();

  return (
    rawMethod === "cashondelivery" ||
    rawMethod.includes("cod") ||
    rawTitle.includes("contraentrega")
  );
};

type CodConfigResponseLike = CodCheckoutConfigResponse & {
  error?: string;
};

const Payment: FC<{
  selectedPayment?: string;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
}> = ({ selectedPayment, isOpen, setIsOpen }) => {
  const token = getCartToken();
  const cart = useAppSelector((state) => state.cartDetail.cart);

  const { data, isLoading, isFetching, isFetched, isError, refetch } = useQuery({
    queryKey: ["paymentMethods", token],
    enabled: !!token,
    queryFn: () =>
      fetchHandler({
        url: "checkout/paymentMethods",
        method: "POST",
        contentType: true,
        body: {},
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }),
  });
  const hasPaymentError = isError || Boolean(data?.error) || !Array.isArray(data?.data);
  const paymentMethods = !hasPaymentError ? data.data : [];
  const uniqueProductIds = useMemo<number[]>(() => {
    const items = Array.isArray(cart?.items?.edges) ? cart.items.edges : [];

    return Array.from(
      new Set<number>(
        items
          .map((item: any) => Number(item?.node?.productId))
          .filter((productId: number) => Number.isFinite(productId) && productId > 0),
      ),
    );
  }, [cart]);
  const hasCodMethod = paymentMethods.some((method: any) => isCodMethod(method));
  const codQueries = useQueries({
    queries: uniqueProductIds.map((productId: number) => ({
      queryKey: ["checkout-cod-config", productId],
      enabled: !!token && hasCodMethod,
      queryFn: async () => {
        const response = await fetch(
          `/api/checkout/cod/config?product_id=${encodeURIComponent(String(productId))}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
            cache: "no-store",
          },
        );

        const payload = (await response.json()) as CodConfigResponseLike;

        if (!response.ok && response.status !== 403) {
          return null;
        }

        return payload;
      },
    })),
  });
  const isCheckingCodAvailability =
    hasCodMethod &&
    uniqueProductIds.length > 0 &&
    codQueries.some((query) => query.isLoading || query.isFetching);
  const blockedCodConfig = useMemo(
    () =>
      codQueries
        .map((query) => query.data)
        .filter(
          (config): config is CodConfigResponseLike =>
            config !== null && config !== undefined,
        )
        .find(
          (config) => config.available === false,
        ) || null,
    [codQueries],
  );
  const codBlockedByProduct = blockedCodConfig?.reason === "product_blocks_cod";
  const normalizedMethods = useMemo(
    () =>
      paymentMethods
        .filter((method: any) => {
          if (!isCodMethod(method)) {
            return true;
          }

          if (isCheckingCodAvailability) {
            return true;
          }

          if (!blockedCodConfig) {
            return true;
          }

          return codBlockedByProduct;
        })
        .map((method: any) => {
          if (!isCodMethod(method)) {
            return method;
          }

          if (isCheckingCodAvailability) {
            return {
              ...method,
              disabled: true,
              helperMessage: "Validando disponibilidad para este producto.",
            };
          }

          if (!blockedCodConfig) {
            return method;
          }

          if (codBlockedByProduct) {
            return {
              ...method,
              disabled: true,
              helperMessage: "Este producto no está disponible para pago contra entrega.",
            };
          }

          return method;
        }),
    [
      blockedCodConfig,
      codBlockedByProduct,
      isCheckingCodAvailability,
      paymentMethods,
    ],
  );
  const isSelectedCodUnavailable =
    Boolean(selectedPayment) &&
    isCodMethod({ method: String(selectedPayment) }) &&
    Boolean(blockedCodConfig);
  const effectiveSelectedPayment = isSelectedCodUnavailable
    ? undefined
    : selectedPayment;
  const effectiveIsOpen = isOpen || !effectiveSelectedPayment;

  if ((isLoading && !isFetched) || (hasCodMethod && isCheckingCodAvailability)) {
    return <CartCheckoutPageSkeleton />;
  }

  if (normalizedMethods.length === 0) {
    return (
      <div className="mt-6">
        <p role="status" className="text-base text-neutral-700">
          {hasPaymentError
            ? "No pudimos consultar los métodos de pago."
            : "No hay métodos de pago disponibles para este pedido."}{" "}
          Consultar los métodos no realiza cobros.
        </p>
        <button
          type="button"
          className="mt-3 min-h-11 text-base text-blue-600 underline disabled:cursor-wait disabled:opacity-60"
          disabled={isFetching || !token}
          onClick={() => { void refetch(); }}
        >
          Volver a consultar
        </button>
      </div>
    );
  }

  return (
    <PaymentMethod
      methods={normalizedMethods}
      selectedPayment={effectiveSelectedPayment as any}
      isOpen={effectiveIsOpen}
      setIsOpen={setIsOpen}
    />
  );
};

export default Payment;
