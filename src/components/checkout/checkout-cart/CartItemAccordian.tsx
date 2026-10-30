import { DEFAULT_OPTION } from "@/utils/constants";
import { useScrollTo } from "@/utils/hooks/useScrollTo";
import { resolveCartItemImage } from "@utils/cart/normalize";
import { NOT_IMAGE } from "@utils/constants";
import { Price } from "@components/theme/ui/Price";
import { Accordion, AccordionItem } from "@heroui/accordion";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { createUrl } from "@utils/helper";
import Image from "next/image";
import Link from "next/link";

type MerchandiseSearchParams = {
  [key: string]: string;
};

export default function CartItemAccordion({
  cartItems,
}: {
  cartItems: any;
}) {

  const cart = Array.isArray(cartItems?.items?.edges)
    ? cartItems?.items?.edges
    : [];

  const scrollTo = useScrollTo();

  return (
    <div className="fixed bottom-0 left-0 z-50 w-full border-t border-sf-border bg-sf-surface/95 pb-[calc(env(safe-area-inset-bottom)+56px)] shadow-[0_-18px_40px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
      <Accordion
        selectionMode="multiple"
        className="!px-0"
        onSelectionChange={(e) => {
          const keys = e as Set<string>;
          if (keys.has("1")) {
            setTimeout(() => {
              scrollTo({
                top: document.body.scrollHeight,
                behavior: "smooth",
              });
            }, 300);
          }
        }}
      >
        <AccordionItem
          key="1"
          indicator={({ isOpen }) =>
            isOpen ? (
              <ChevronLeftIcon className="h-5 w-5 stroke-sf-content" />
            ) : (
              <ChevronRightIcon className="h-5 w-5 stroke-sf-content" />
            )
          }
          classNames={{
            heading: "sticky top-0 z-50 bg-sf-surface px-4",
            content: "px-4 text-sf-content",
            title: "text-sf-content",
            subtitle: "text-sf-muted",
            trigger: "focus-visible:outline-2 focus-visible:outline-sf-focus focus-visible:outline-offset-2",
          }}
          aria-label="Resumen del pedido"
          title="Resumen del pedido"
          subtitle={
            <Price
              className=""
              amount={cartItems?.grandTotal || "0"}
              currencyCode={"USD"}
            />
          }
        >
          <div className="flex h-full flex-col justify-between px-4">
            <div className="rounded-2xl bg-sf-subtle px-4 py-3 text-sm text-sf-muted">
              {cart.length} {cart.length === 1 ? "producto" : "productos"} listos para checkout.
            </div>

            <ul className="max-h-[300px] flex-grow overflow-y-auto py-4 pr-2 -mr-2" style={{ scrollbarWidth: "thin" }}>
              {cart?.map((item: any, i: number) => {
                const merchandiseSearchParams = {} as MerchandiseSearchParams;
                const merchandiseUrl = createUrl(
                                `/product/${item?.node.productUrlKey}`,
                                new URLSearchParams(merchandiseSearchParams)
                              );
                const imageSrc = resolveCartItemImage(item?.node?.baseImage);
                return (
                  <li key={i} className="flex w-full flex-col">
                    <div className="relative flex w-full flex-row justify-between gap-3 px-1 py-4">
                      <Link
                        href={merchandiseUrl}
                        className="z-30 flex flex-row items-center space-x-4"
                        aria-label={`${item?.node?.name}`}
                      >
                        <div className="relative h-16 w-16 cursor-pointer overflow-hidden rounded-md border border-sf-border bg-sf-subtle ">
                          <Image
                            className="h-full w-full object-cover"
                            width={64}
                            height={64}
                            alt={item?.node?.baseImage || item?.product?.name}
                            src={imageSrc}
                            onError={(e) => (e.currentTarget.src = NOT_IMAGE)}
                          />
                        </div>

                        <div className="flex flex-1 flex-col text-base">
                          <span className="leading-tight text-sf-content line-clamp-1">
                            {item?.node?.name}
                          </span>
                          <span className="font-normal text-sf-content">
                            Cantidad: {item.node.quantity}
                          </span>
                          {item.name !== DEFAULT_OPTION ? (
                            <p className="text-sm lowercase line-clamp-1 text-sf-muted">
                              {item?.node?.sku}
                            </p>
                          ) : null}
                        </div>
                      </Link>
                      <div className="flex h-16 flex-col justify-between text-sf-muted">
                        <Price
                          className="flex justify-end space-y-2 text-right text-sm"
                          amount={item?.node?.price}
                          currencyCode={"USD"}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="py-4 text-sm text-sf-muted">
              <div className="mb-3 flex items-center justify-between pb-1">
                <p className="font-outfit text-base font-normal text-sf-muted">
                  Subtotal
                </p>
                <Price
                  className="text-right text-base text-sf-content"
                  amount={cartItems?.subtotal || "0"}
                  currencyCode={"USD"}
                />
              </div>
              <div className="mb-3 flex items-center justify-between pb-1 pt-1">
                <p className="font-outfit text-base font-normal text-sf-muted">
                  Envío
                </p>
                {cartItems?.shippingAmount ? (
                  <Price
                    amount={cartItems?.shippingAmount || "0"}
                    className="text-right text-base text-sf-content"
                    currencyCode={"USD"}
                  />
                ) : (
                  <p className="text-right text-base text-sf-muted">
                    Calculado en el siguiente paso
                  </p>
                )}
              </div>
              <div className="mb-3 flex items-center justify-between pb-1 pt-1">
                <p className="text-xl font-bold text-sf-content">Total</p>
                <Price
                  className="text-right text-base text-sf-content"
                  amount={cartItems?.grandTotal || "0"}
                  currencyCode={"USD"}
                />
              </div>
            </div>
          </div>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
