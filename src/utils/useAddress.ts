"use client"

import { useQuery } from "@tanstack/react-query";
import { getCartToken } from "./getCartToken";
import { fetchHandler } from "./fetch-handler";


export const useAddress = (enabled = true) => {
  const token = getCartToken();

  return useQuery({
    queryKey: ["address", token],
    enabled: !!token && enabled,
    queryFn: () =>
      fetchHandler({
        url: "checkout/saveAddress",
        method: "POST",
        contentType: true,
        body: "",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }),
  });
};
