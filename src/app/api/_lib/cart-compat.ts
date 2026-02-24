const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toString = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
};

const toArray = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
};

export const normalizeLegacyCart = (cart: any) => {
  if (!cart) return null;

  const selectedShippingRateMethod =
    cart?.selectedShippingRate?.method ?? cart?.shippingMethod ?? "";
  const selectedShippingRateTitle =
    cart?.selectedShippingRate?.methodTitle ?? selectedShippingRateMethod;

  const items = toArray(cart?.items).map((item: any) => {
    const productUrlKey =
      item?.product?.urlKey ?? item?.productUrlKey ?? "";

    return {
      node: {
        id: toNumber(item?.id),
        cartId: toNumber(item?.cartId ?? cart?.id),
        productId: toNumber(item?.productId),
        name: toString(item?.name),
        sku: toString(item?.sku),
        quantity: toNumber(item?.quantity, 1),
        type: toString(item?.type),
        productUrlKey,
        canChangeQty: true,
        price: toNumber(item?.price),
        baseImage: item?.baseImage ?? item?.product?.baseImage?.url ?? null,
      },
    };
  });

  return {
    id: toNumber(cart?.id),
    itemsQty: toNumber(cart?.itemsQty),
    itemsCount: toNumber(cart?.itemsCount),
    taxAmount: toNumber(cart?.taxTotal ?? cart?.taxAmount),
    shippingAmount: toNumber(cart?.shippingAmount),
    subtotal: toNumber(cart?.subTotal ?? cart?.subtotal),
    grandTotal: toNumber(cart?.grandTotal),
    paymentMethod: toString(cart?.payment?.method ?? cart?.paymentMethod),
    paymentMethodTitle: toString(
      cart?.payment?.methodTitle ?? cart?.paymentMethodTitle,
    ),
    shippingMethod: toString(cart?.shippingMethod),
    selectedShippingRate: toString(selectedShippingRateMethod),
    selectedShippingRateTitle: toString(selectedShippingRateTitle),
    isGuest: cart?.isGuest ?? true,
    items: {
      edges: items,
    },
  };
};

export const flattenShippingMethods = (shippingGroups: any[]): any[] => {
  if (!Array.isArray(shippingGroups)) return [];

  const flattened: any[] = [];

  shippingGroups.forEach((group, groupIndex) => {
    const methods = Array.isArray(group?.methods)
      ? group.methods
      : group?.methods
        ? [group.methods]
        : [];

    methods.forEach((method: any, methodIndex: number) => {
      const code = toString(method?.code);
      if (!code) return;

      flattened.push({
        id: `${groupIndex}-${methodIndex}`,
        code,
        method: code,
        label: toString(method?.label ?? group?.title ?? code),
        description: toString(group?.title ?? method?.label ?? code),
        price: toNumber(method?.price),
        formattedPrice: toString(method?.formattedPrice),
      });
    });
  });

  return flattened;
};
