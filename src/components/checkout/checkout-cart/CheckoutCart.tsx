import { DEFAULT_OPTION } from "@/utils/constants";
import { GridTileImage } from "@components/theme/ui/grid/Tile";
import { Price } from "@components/theme/ui/Price";
import { resolveCartItemImage } from "@utils/cart/normalize";
import CartItemAccordion from "./CartItemAccordian";
import { NOT_IMAGE } from "@utils/constants";
import Link from "next/link";
import { createUrl } from "@utils/helper";
type MerchandiseSearchParams = {
  [key: string]: string;
};

export default function CheckoutCart({ cartItems, selectedShippingRate: _id }: { cartItems: any, selectedShippingRate?: any }) {

  const cart = Array.isArray(cartItems?.items?.edges)
    ? cartItems?.items?.edges
    : [];
  return (
    <>
      <CartItemAccordion cartItems={cartItems} />
      <aside className="hidden lg:block">
        <div className="overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="border-b border-neutral-200 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
              Resumen
            </p>
            <div className="mt-3 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-neutral-950">
                  Tu pedido
                </h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  {cart.length} {cart.length === 1 ? "producto" : "productos"} listos para compra.
                </p>
              </div>

              <div className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                Checkout seguro
              </div>
            </div>
          </div>

          <ul className="m-0 flex max-h-[calc(100dvh-430px)] flex-col gap-y-5 overflow-y-auto px-6 py-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-400">
            {Array.isArray(cart) &&
              cart &&
              cart?.map((item: any, i: number) => {
                const merchandiseSearchParams = {} as MerchandiseSearchParams;
                const merchandiseUrl = createUrl(
                  `/product/${item?.node.productUrlKey}`,
                  new URLSearchParams(merchandiseSearchParams)
                );
                const imageSrc = resolveCartItemImage(item?.node?.baseImage);

                return (
                  <li key={i} className="flex w-full flex-col">
                    <div className="relative flex w-full flex-row justify-between gap-4">
                      <Link
                        className="z-30 flex min-w-0 flex-row items-center space-x-4"
                        aria-label={`${item?.node?.name}`}
                        href={merchandiseUrl}
                      >
                        <div className="relative h-24 w-24 cursor-pointer rounded-2xl bg-neutral-100 xl:h-28 xl:w-28">
                          <GridTileImage
                            alt={item?.node?.baseImage || item?.product?.name}
                            className="h-full w-full object-cover"
                            height={112}
                            src={imageSrc || NOT_IMAGE}
                            width={112}
                            onError={(e) => (e.currentTarget.src = NOT_IMAGE)}
                          />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col text-base">
                          <h1 className="line-clamp-2 font-outfit text-lg font-medium text-neutral-950">
                            {item?.node?.name}
                          </h1>
                          {item.name !== DEFAULT_OPTION ? (
                            <p className="mt-1 text-sm font-normal text-neutral-500">
                              {item?.node?.sku}
                            </p>
                          ) : null}
                          <span className="mt-2 font-normal text-neutral-700">
                            Cantidad: {item?.node?.quantity}
                          </span>
                          <div className="mt-3 block xl:hidden">
                            <Price
                              amount={item?.node?.price}
                              className="space-y-2 text-start font-outfit text-lg font-medium text-neutral-950 xl:text-right"
                              currencyCode={"USD"}
                            />
                          </div>
                        </div>
                      </Link>
                      <div className="hidden xl:block">
                        <Price
                          amount={item?.node?.price}
                          className="space-y-2 text-start font-outfit text-lg font-medium text-neutral-950 xl:text-right"
                          currencyCode={"USD"}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
          </ul>

          <div className="border-t border-neutral-200 bg-neutral-50 px-6 py-6 text-sm text-neutral-500">
            <div className="mb-3 flex items-center justify-between pb-1">
              <p className="font-outfit text-base font-normal text-black/[60%]">
                Subtotal
              </p>
              <Price
                amount={cartItems?.subtotal || "0"}
                className="text-right text-base text-black"
                currencyCode={"USD"}
              />
            </div>

            <div className="mb-3 flex items-center justify-between pb-1 pt-1">
              <p className="font-outfit text-base font-normal text-black/[60%]">
                Envío
              </p>
              {cartItems?.shippingAmount ? (
                <Price
                  amount={cartItems?.shippingAmount}
                  className="text-right text-base text-black"
                  currencyCode={"USD"}
                />
              ) : (
                <p className="text-right text-base text-neutral-600">
                  Calculado en el siguiente paso
                </p>
              )}
            </div>

            <div className="my-6 flex items-center justify-between">
              <p className="font-outfit text-2xl font-normal text-black/[60%]">
                Total general
              </p>
              <Price
                amount={(cartItems as any)?.grandTotal || "0"}
                className="text-right font-outfit text-2xl font-normal text-black"
                currencyCode={"USD"}
              />
            </div>

            <p className="text-xs leading-5 text-neutral-500">
              El valor final puede cambiar según la dirección y el método de
              envío que elijas en el siguiente paso.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
