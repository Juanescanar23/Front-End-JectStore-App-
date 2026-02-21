"use client";

import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { useAddProduct } from "@utils/hooks/useAddToCart";
import LoadingDots from "@components/common/icons/LoadingDots";
import { getVariantInfo } from "@utils/hooks/useVariantInfo";
import { safeParse } from "@utils/helper";

function SubmitButton({
  selectedVariantId,
  pending,
  type,
  isSaleable,
}: {
  selectedVariantId: boolean;
  pending: boolean;
  type: string;
  isSaleable: string;
}) {
  const buttonClasses =
    "relative flex h-fit w-full items-center justify-center rounded-full bg-blue-600 p-4 text-sm font-semibold tracking-wide text-white sm:w-auto sm:min-w-[12rem]";
  const disabledClasses = "cursor-wait opacity-60";

  if (!isSaleable || isSaleable === "") {
    return (
      <button
        aria-disabled
        aria-label="Agotado"
        type="button"
        disabled
        className={clsx(buttonClasses, "opacity-60 !cursor-not-allowed")}
      >
        Agotado
      </button>
    );
  }

  if (!selectedVariantId && type === "configurable") {
    return (
      <button
        aria-disabled
        aria-label="Selecciona una opción"
        type="button"
        disabled={!selectedVariantId}
        className={clsx(buttonClasses, "opacity-60 !cursor-not-allowed")}
      >
        Agregar al carrito
      </button>
    );
  }

  return (
    <button
      aria-disabled={pending}
      aria-label="Agregar al carrito"
      type="submit"
      className={clsx(buttonClasses, {
        "hover:opacity-90": true,
        [disabledClasses]: pending,
      })}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        if (pending) e.preventDefault();
      }}
    >
      <div className="absolute left-0 ml-4">
        {pending ? <LoadingDots className="mb-3 bg-white" /> : ""}
      </div>
      Agregar al carrito
    </button>
  );
}

function WhatsAppButton({ href }: { href?: string | null }) {
  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Consultar por WhatsApp"
      className="inline-flex h-fit w-full items-center justify-center rounded-full border border-neutral-900 bg-white px-6 py-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-900 hover:text-white sm:w-auto sm:min-w-[10rem]"
    >
      WhatsApp
    </a>
  );
}

export function AddToCart({
  productSwatchReview,
  index,
  productId,
  userInteracted,
  whatsappUrl,
}: {
  productSwatchReview: any;
  productId: string;
  index: Record<string, Record<string, number>>;
  userInteracted: boolean;
  whatsappUrl?: string | null;
}) {
  const isSaleable = productSwatchReview?.isSaleable || "";
  const { onAddToCart, isCartLoading } = useAddProduct();
  const { handleSubmit, setValue, control, register } = useForm({
    defaultValues: {
      quantity: 1,
      isBuyNow: false,
    },
  });

  const quantity = useWatch({
    control,
    name: "quantity",
  });

  const increment = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setValue("quantity", Number(quantity) + 1);
  };

  const decrement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setValue("quantity", Math.max(1, Number(quantity) - 1));
  };

  const searchParams = useSearchParams();
  const type = productSwatchReview?.type;

  const superAttributes = productSwatchReview?.superAttributeOptions
    ? safeParse(productSwatchReview.superAttributeOptions)
    : productSwatchReview?.superAttributes || [];

  const isConfigurable = superAttributes.length > 0;

  const { productid: selectedVariantId, Instock: checkStock } = getVariantInfo(
    isConfigurable,
    searchParams.toString(),
    superAttributes,
    JSON.stringify(index),
  );
  const buttonStatus = !!selectedVariantId;

  const actionWithVariant = async (data: any) => {
    const pid =
      type === "configurable"
        ? String(selectedVariantId)
        : (String(productId).split("/").pop() ?? "");
    onAddToCart({
      productId: pid,
      quantity: data.quantity,
    });
  };

  return (
    <>
      {!checkStock && type === "configurable" && userInteracted && (
        <div className="my-2 gap-1 px-2 py-1 font-bold">
          <h1>NO HAY STOCK DISPONIBLE</h1>
        </div>
      )}
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={handleSubmit(actionWithVariant)}
      >
        <div className="flex items-center justify-center">
          <div className="flex items-center rounded-full border-2 border-blue-500">
            <div
              aria-label="Disminuir cantidad"
              role="button"
              className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-l-full text-gray-600 transition-colors hover:text-gray-800 dark:text-white hover:dark:text-white/[80%]"
              onClick={decrement}
            >
              <MinusIcon className="h-4 w-4" />
            </div>

            <input
              type="hidden"
              {...register("quantity", { valueAsNumber: true })}
            />

            <div className="flex h-12 min-w-[3rem] items-center justify-center px-4 font-medium text-gray-800 dark:text-white">
              {quantity}
            </div>

            <div
              aria-label="Aumentar cantidad"
              role="button"
              className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-r-full text-gray-600 transition-colors hover:text-gray-800 dark:text-white hover:dark:text-white/[80%]"
              onClick={increment}
            >
              <PlusIcon className="h-4 w-4" />
            </div>
          </div>
        </div>

        <SubmitButton
          pending={isCartLoading}
          selectedVariantId={buttonStatus}
          type={type || ""}
          isSaleable={isSaleable}
        />

        <WhatsAppButton href={whatsappUrl} />
      </form>
    </>
  );
}
