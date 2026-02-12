"use client";

import { ORDER_ID } from "@/utils/constants";
import { getCookie } from "@utils/getCartToken";
import { useEffect, useState } from "react";

export default function OrderDetail() {
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      setOrderId(getCookie(ORDER_ID));
    });
  }, []);

  return (
    <div className="mb-8 font-outfit">
      <h1 className="my-2 text-center text-3xl font-semibold sm:text-4xl">
        Tu pedido{" "}
        <span className="text-primary">
          #{orderId ? orderId : <span className="animate-pulse">...</span>}
        </span>{" "}
        se realizó correctamente
      </h1>
      <p className="text-center text-lg font-normal text-black/60 dark:text-neutral-300">
        Te enviaremos un correo con los detalles de tu compra.
      </p>
    </div>
  );
}
