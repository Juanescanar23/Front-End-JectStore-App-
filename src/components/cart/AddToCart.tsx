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
  isSaleable: boolean;
}) {
  const buttonClasses =
    "relative flex h-fit w-full items-center justify-center rounded-full bg-neutral-900 px-5 py-4 text-sm font-semibold tracking-wide text-white transition hover:bg-neutral-800 lg:w-auto lg:min-w-[11.75rem]";
  const disabledClasses = "cursor-wait opacity-60";

  if (!isSaleable) {
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

function WhatsAppButton({
  href,
  label,
  primary = false,
}: {
  href?: string | null;
  label: string;
  primary?: boolean;
}) {
  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={clsx(
        "inline-flex h-fit w-full items-center justify-center rounded-full px-6 py-4 text-sm font-semibold transition lg:w-auto",
        primary
          ? "border border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 lg:min-w-[13rem]"
          : "border border-neutral-900 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white lg:min-w-[9.75rem]",
      )}
    >
      {label}
    </a>
  );
}

export function AddToCart({
  productSwatchReview,
  index,
  productId,
  userInteracted,
  whatsappUrl,
  isSaleable = true,
  allowsCheckout = true,
  showSoldOutWhatsappCta = false,
  soldOutWhatsappUrl,
  soldOutHelperText,
}: {
  productSwatchReview: any;
  productId: string;
  index: Record<string, Record<string, number>>;
  userInteracted: boolean;
  whatsappUrl?: string | null;
  isSaleable?: boolean;
  allowsCheckout?: boolean;
  showSoldOutWhatsappCta?: boolean;
  soldOutWhatsappUrl?: string | null;
  soldOutHelperText?: string;
}) {
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
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-700">
          No hay stock disponible para esta combinación.
        </div>
      )}
      <form
        className={clsx(
          "flex flex-col gap-4",
          !showSoldOutWhatsappCta && allowsCheckout && "lg:flex-row lg:items-center lg:gap-5",
        )}
        onSubmit={handleSubmit(actionWithVariant)}
      >
        {!showSoldOutWhatsappCta && isSaleable && allowsCheckout ? (
          <div className="flex items-center justify-start lg:flex-none">
            <div className="flex items-center rounded-full border border-neutral-900">
              <div
                aria-label="Disminuir cantidad"
                role="button"
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-l-full text-neutral-700 transition-colors hover:text-black"
                onClick={decrement}
              >
                <MinusIcon className="h-4 w-4" />
              </div>

              <input
                type="hidden"
                {...register("quantity", { valueAsNumber: true })}
              />

              <div className="flex h-12 min-w-[3rem] items-center justify-center px-4 font-medium text-neutral-900">
                {quantity}
              </div>

              <div
                aria-label="Aumentar cantidad"
                role="button"
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-r-full text-neutral-700 transition-colors hover:text-black"
                onClick={increment}
              >
                <PlusIcon className="h-4 w-4" />
              </div>
            </div>
          </div>
        ) : null}

        <div
          className={clsx(
            "flex w-full flex-col gap-3",
            !showSoldOutWhatsappCta && allowsCheckout && "lg:flex-1 lg:flex-row lg:items-center lg:gap-3",
          )}
        >
          {showSoldOutWhatsappCta ? (
            <>
              <WhatsAppButton
                href={soldOutWhatsappUrl}
                label="Consultar por WhatsApp"
                primary
              />
              {soldOutHelperText ? (
                <p className="max-w-xl text-sm leading-6 text-neutral-600">
                  {soldOutHelperText}
                </p>
              ) : null}
            </>
          ) : allowsCheckout ? (
            <SubmitButton
              pending={isCartLoading}
              selectedVariantId={buttonStatus}
              type={type || ""}
              isSaleable={isSaleable}
            />
          ) : (
            <>
              <WhatsAppButton href={whatsappUrl} label="Pedir por WhatsApp" primary />
              <p className="max-w-xl text-sm leading-6 text-neutral-600">
                {whatsappUrl
                  ? "Esta tienda recibe pedidos directamente por WhatsApp."
                  : "Los pedidos de esta tienda se gestionan fuera del checkout en línea."}
              </p>
            </>
          )}

          {!showSoldOutWhatsappCta && allowsCheckout && whatsappUrl ? (
            <WhatsAppButton href={whatsappUrl} label="WhatsApp" />
          ) : null}
        </div>
      </form>
    </>
  );
}
