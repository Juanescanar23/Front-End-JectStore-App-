
"use client";

import { useMutation } from "@tanstack/react-query";
import { useCustomToast } from "./useToast";
import { useAppDispatch } from "@/store/hooks";
import { fetchHandler } from "../fetch-handler";
import { addItem } from "@/store/slices/cart-slice";


interface MergeCartInput {
  token: string;
  cartId: number;
  guestCartToken: string;
}

const MERGE_ERROR = "No se pudo unir el carrito. Intenta de nuevo.";

export function useMergeCart() {
  const { showToast } = useCustomToast();
  const dispatch = useAppDispatch();


  const {
    mutateAsync: mergeCartRequest,
    isPending: isLoading,
    error,
  } = useMutation({
    mutationFn: async ({ token, ...input }: MergeCartInput) => {
      try {
        const response = await fetchHandler({
          url: "cart/mergeCart",
          method: "POST",
          contentType: true,
          body: { ...input },
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const cartId = response?.data?.createMergeCart?.mergeCart?.id;
        if (
          response?.error || response?.errors ||
          (typeof cartId !== "string" && typeof cartId !== "number") ||
          !/^[1-9]\d*$/.test(String(cartId)) || !Number.isSafeInteger(Number(cartId))
        ) {
          throw new Error(MERGE_ERROR);
        }
        return response;
      } catch {
        throw new Error(MERGE_ERROR);
      }
    },

    onSuccess: (response) => {
      const responseData = response?.data?.createMergeCart?.mergeCart
      if (!responseData) {
        return;
      }

      const cartId = responseData?.id ?? null;

      const setCookie = (name: string, value: string | number, days = 30) => {
        if (typeof window === "undefined" || !name) return;
        const d = new Date();
        d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
        const expires = "expires=" + d.toUTCString();
        document.cookie = `${name}=${encodeURIComponent(String(value))};${expires};path=/`;
      };

      if (cartId !== null && typeof cartId !== "undefined") {
        setCookie("guest_cart_id", String(cartId));
      }

      dispatch(addItem(responseData));
    },

    onError: () => {
      showToast(MERGE_ERROR, "danger");
    },
  });

  const mergeCart = async (token: string, cartId: number, guestCartToken: string) => {
    return await mergeCartRequest({ token, cartId, guestCartToken });
  };

  return {
    mergeCart,
    isLoading,
    error,
  };
}
