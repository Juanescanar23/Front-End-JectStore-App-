"use client";

import clsx from "clsx";
import Link from "next/link";
import { ArrowLeftIcon, ShoppingCartIcon } from "@heroicons/react/24/outline";
import { useFormStatus } from "react-dom";

import { useAppSelector } from "@/store/hooks";
import { redirectToCheckout } from "@/utils/actions";
import { resolveCartItemImage } from "@/utils/cart/normalize";
import { DEFAULT_OPTION, NOT_IMAGE } from "@/utils/constants";
import { createUrl, isCheckout, useAddressesFromApi } from "@/utils/helper";
import { useCartDetail } from "@/utils/hooks/useCartDetail";
import { EMAIL, getLocalStorage } from "@/store/local-storage";
import { isObject } from "@/utils/type-guards";
import LoadingDots from "@/components/common/icons/LoadingDots";
import { DeleteItemButton } from "@/components/common/icons/cart/DeleteItemButton";
import { EditItemQuantityButton } from "@/components/common/icons/cart/EditItemQuantityButton";
import { Price } from "@/components/theme/ui/Price";
import { GridTileImage } from "@/components/theme/ui/grid/Tile";

type MerchandiseSearchParams = {
  [key: string]: string;
};

function ProceedToCheckoutButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className={clsx(
        "block w-full rounded-full bg-white px-4 py-3 text-center text-sm font-semibold text-neutral-950 transition hover:bg-neutral-100",
        pending ? "cursor-wait" : "cursor-pointer"
      )}
      disabled={pending}
      type="submit"
    >
      {pending ? <LoadingDots className="bg-neutral-950" /> : "Continuar al checkout"}
    </button>
  );
}

export default function CartPage() {
  const { isLoading } = useCartDetail();
  const { billingAddress } = useAddressesFromApi();
  const cartDetail = useAppSelector((state) => state.cartDetail);
  const cart = Array.isArray(cartDetail?.cart?.items?.edges)
    ? cartDetail?.cart?.items?.edges
    : [];
  const cartObj: any = cartDetail?.cart ?? {};
  const itemCount = Number(cartDetail?.cart?.itemsQty || cart.length || 0);
  const checkoutUrl = isCheckout(
    cartObj?.items?.edges ?? [],
    cartObj?.isGuest,
    cartObj?.customerEmail ?? getLocalStorage(EMAIL),
    isObject(billingAddress),
    cartObj?.selectedShippingRate != null,
    cartObj?.paymentMethod != null
  );

  if (isLoading) {
    return (
      <section className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pb-20 lg:pt-10">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_390px]">
          <div className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="mb-6 h-10 w-56 animate-pulse rounded-full bg-neutral-200" />
            <div className="space-y-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex animate-pulse gap-4 rounded-2xl border border-neutral-100 px-4 py-4"
                >
                  <div className="h-24 w-24 rounded-2xl bg-neutral-200" />
                  <div className="flex flex-1 flex-col gap-3">
                    <div className="h-5 w-3/4 rounded bg-neutral-200" />
                    <div className="h-4 w-1/3 rounded bg-neutral-200" />
                    <div className="h-4 w-1/4 rounded bg-neutral-200" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] bg-neutral-950 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
            <div className="mb-5 h-5 w-24 animate-pulse rounded bg-white/15" />
            <div className="space-y-4">
              <div className="h-4 w-full animate-pulse rounded bg-white/15" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-white/15" />
              <div className="h-12 w-full animate-pulse rounded-full bg-white/15" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!cart.length) {
    return (
      <section className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pb-24 lg:pt-14">
        <div className="rounded-[32px] border border-dashed border-neutral-300 bg-white px-6 py-12 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:px-10">
          <ShoppingCartIcon className="mx-auto h-14 w-14 text-neutral-400" />
          <h1 className="mt-6 text-3xl font-semibold text-neutral-950">
            Tu carrito está vacío
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-600 sm:text-base">
            Agrega productos para continuar con tu compra. Cuando tengas todo
            listo, aquí verás el resumen completo antes del checkout.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-neutral-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Explorar productos
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pb-20 lg:pt-10">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Seguir comprando
          </Link>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
            Carrito
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-neutral-950 sm:text-4xl">
            Revisa tu pedido
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
            Ajusta cantidades, elimina artículos y continúa cuando quieras.
            Desde aquí puedes revisar todo antes de pasar a dirección, envío y
            pago.
          </p>
        </div>

        <div className="inline-flex w-fit items-center rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm">
          {itemCount} {itemCount === 1 ? "artículo" : "artículos"} listos para checkout
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_390px]">
        <div className="rounded-[30px] border border-neutral-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-6">
          <ul className="divide-y divide-neutral-200">
            {cart.map((item: any, index: number) => {
              const merchandiseSearchParams = {} as MerchandiseSearchParams;
              const merchandiseUrl = createUrl(
                `/product/${item?.node?.productUrlKey}`,
                new URLSearchParams(merchandiseSearchParams)
              );
              const imageSrc = resolveCartItemImage(item?.node?.baseImage);

              return (
                <li key={index} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                    <Link
                      href={merchandiseUrl}
                      className="flex min-w-0 flex-1 items-start gap-4"
                    >
                      <div className="h-24 w-24 flex-none overflow-hidden rounded-2xl bg-neutral-100">
                        <GridTileImage
                          alt={item?.node?.baseImage || item?.product?.name}
                          className="h-full w-full object-cover"
                          height={96}
                          src={imageSrc || NOT_IMAGE}
                          width={96}
                          onError={(e) => (e.currentTarget.src = NOT_IMAGE)}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h2 className="line-clamp-2 text-lg font-semibold text-neutral-950">
                          {item?.node?.name}
                        </h2>
                        {item.name !== DEFAULT_OPTION ? (
                          <p className="mt-1 text-sm text-neutral-500">
                            {item?.node?.sku}
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm text-neutral-600">
                          Cantidad actual: {item?.node?.quantity}
                        </p>
                      </div>
                    </Link>

                    <div className="flex flex-col gap-4 sm:items-end">
                      <Price
                        amount={item?.node?.price}
                        className="text-left text-lg font-semibold text-neutral-950 sm:text-right"
                        currencyCode={"USD"}
                      />
                      <div className="flex items-center gap-2">
                        <DeleteItemButton item={item} />
                        <div className="flex h-10 items-center rounded-full border border-neutral-200">
                          <EditItemQuantityButton item={item} type="minus" />
                          <span className="w-8 text-center text-sm font-medium text-neutral-900">
                            {item?.node?.quantity}
                          </span>
                          <EditItemQuantityButton item={item} type="plus" />
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="xl:sticky xl:top-24">
          <div className="rounded-[30px] bg-neutral-950 p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">
              Resumen
            </p>
            <h2 className="mt-3 text-2xl font-semibold">Todo listo para pagar</h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              Continúa al checkout y retoma automáticamente el paso que ya
              tengas avanzado.
            </p>

            <div className="mt-8 space-y-4 text-sm text-white/70">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <Price
                  amount={cartObj?.subtotal || "0"}
                  className="text-right text-base text-white"
                  currencyCode={"USD"}
                />
              </div>

              <div className="flex items-center justify-between">
                <span>Impuestos</span>
                <Price
                  amount={cartObj?.taxAmount || "0"}
                  className="text-right text-base text-white"
                  currencyCode={"USD"}
                />
              </div>

              <div className="flex items-center justify-between">
                <span>Envío</span>
                {cartObj?.shippingAmount ? (
                  <Price
                    amount={cartObj?.shippingAmount}
                    className="text-right text-base text-white"
                    currencyCode={"USD"}
                  />
                ) : (
                  <span className="text-right text-sm text-white/60">
                    Se calcula en checkout
                  </span>
                )}
              </div>
            </div>

            <div className="my-6 h-px bg-white/10" />

            <div className="flex items-center justify-between">
              <span className="text-base font-medium text-white/70">Total</span>
              <Price
                amount={cartObj?.grandTotal || "0"}
                className="text-right text-2xl font-semibold text-white"
                currencyCode={"USD"}
              />
            </div>

            <form action={redirectToCheckout} className="mt-8">
              <input name="url" type="hidden" value={checkoutUrl} />
              <ProceedToCheckoutButton />
            </form>

            <p className="mt-4 text-xs leading-5 text-white/60">
              Tu progreso se mantiene cuando pases al checkout, así que puedes
              completar la compra sin volver a cargar el carrito.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
