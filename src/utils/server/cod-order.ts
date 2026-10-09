import {
  CREATE_ADD_PRODUCT_IN_CART,
  CREATE_CART_TOKEN,
  CREATE_CHECKOUT_ADDRESS,
  CREATE_CHECKOUT_ORDER,
  CREATE_CHECKOUT_PAYMENT_METHODS,
  CREATE_CHECKOUT_SHIPPING_METHODS,
  GET_CHECKOUT_PAYMENT_METHODS,
  GET_CHECKOUT_SHIPPING_RATES,
} from "@/graphql";
import {
  CodCheckoutConfigResponse,
  CodOrderRequestBody,
  CodOrderResponse,
  CodOffer,
  CodPortalOrder,
  CodSelectionPerUnit,
} from "@/types/cod";
import { bagistoFetch } from "@/utils/bagisto";
import { resolveCodCheckoutConfig } from "@/utils/server/cod-config";
import { fetchLandlordJson } from "@/utils/server/tenant-runtime";
import { upsertTenantCodOrder } from "@/utils/server/cod-store";

interface CodOrderValidationResult {
  ok: boolean;
  status: number;
  message?: string;
  config: CodCheckoutConfigResponse;
  offer: CodOffer | null;
  resolvedVariantLines: Array<{ productId: number; quantity: number }>;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  feeTotal: number;
  grandTotal: number;
  selectedShippingMethodCode: string;
}

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const splitFullName = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return {
      firstName: "Cliente",
      lastName: "COD",
    };
  }

  const [firstName, ...rest] = normalized.split(" ");
  return {
    firstName,
    lastName: rest.join(" ") || "COD",
  };
};

const isPhysicalProduct = (type?: string | null) => {
  const normalized = String(type || "").trim().toLowerCase();
  if (!normalized) return true;
  return !["virtual", "downloadable"].includes(normalized);
};

function resolveVariantId(
  variantIndex: Record<string, Record<string, number>>,
  attributes: Record<string, number>,
): number | null {
  const pairs = Object.entries(variantIndex).find(([_, candidate]) =>
    Object.entries(attributes).every(([code, optionId]) => candidate[code] === optionId),
  );

  if (!pairs) {
    return null;
  }

  const variantId = Number(pairs[0]);
  return Number.isFinite(variantId) ? variantId : null;
}

function normalizeSelectionAttributes(
  value: unknown,
): Record<string, number> {
  if (!value || typeof value !== "object") return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>(
    (acc, [key, rawValue]) => {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        return acc;
      }

      acc[key] = parsed;
      return acc;
    },
    {},
  );
}

function selectionIsComplete(
  attributes: Record<string, number>,
  requiredCodes: string[],
): boolean {
  if (!requiredCodes.length) return true;
  return requiredCodes.every((code) => Number.isFinite(attributes[code]));
}

function resolveSingleOrSharedVariant(
  config: CodCheckoutConfigResponse,
  requiredCodes: string[],
  rawSelection: unknown,
): { ok: true; lines: Array<{ productId: number; quantity: number }> } | {
  ok: false;
  message: string;
} {
  const snapshot = config.product_snapshot;
  if (!snapshot) {
    return { ok: false, message: "No se encontró el producto para COD." };
  }

  if (!snapshot.has_variants || requiredCodes.length === 0) {
    return {
      ok: true,
      lines: [{ productId: snapshot.id, quantity: 1 }],
    };
  }

  const selection =
    rawSelection && typeof rawSelection === "object" && "attributes" in (rawSelection as Record<string, unknown>)
      ? normalizeSelectionAttributes((rawSelection as Record<string, unknown>).attributes)
      : normalizeSelectionAttributes(rawSelection);

  if (!selectionIsComplete(selection, requiredCodes)) {
    return { ok: false, message: "Completa todas las variantes requeridas." };
  }

  const variantId = resolveVariantId(snapshot.variant_index, selection);

  if (!variantId) {
    return {
      ok: false,
      message: "La combinación de variantes no es válida para este producto.",
    };
  }

  return {
    ok: true,
    lines: [{ productId: variantId, quantity: 1 }],
  };
}

function resolvePerUnitVariants(
  config: CodCheckoutConfigResponse,
  requiredCodes: string[],
  unitsCount: number,
  rawSelections: unknown,
): { ok: true; lines: Array<{ productId: number; quantity: number }> } | {
  ok: false;
  message: string;
} {
  const snapshot = config.product_snapshot;
  if (!snapshot) {
    return { ok: false, message: "No se encontró el producto para COD." };
  }

  if (!snapshot.has_variants || requiredCodes.length === 0) {
    return {
      ok: true,
      lines: [{ productId: snapshot.id, quantity: unitsCount }],
    };
  }

  if (!Array.isArray(rawSelections)) {
    return {
      ok: false,
      message: "Selecciona las variantes por unidad para continuar.",
    };
  }

  if (rawSelections.length !== unitsCount) {
    return {
      ok: false,
      message: "La cantidad de selecciones no coincide con las unidades del combo.",
    };
  }

  const counts = new Map<number, number>();

  for (const rawSelection of rawSelections as CodSelectionPerUnit[]) {
    const attributes =
      rawSelection && typeof rawSelection === "object" && "attributes" in rawSelection
        ? normalizeSelectionAttributes(rawSelection.attributes)
        : {};

    if (!selectionIsComplete(attributes, requiredCodes)) {
      return { ok: false, message: "Completa todas las variantes requeridas." };
    }

    const variantId = resolveVariantId(snapshot.variant_index, attributes);
    if (!variantId) {
      return {
        ok: false,
        message: "Una de las combinaciones de variantes no es válida.",
      };
    }

    counts.set(variantId, (counts.get(variantId) || 0) + 1);
  }

  return {
    ok: true,
    lines: Array.from(counts.entries()).map(([productId, quantity]) => ({
      productId,
      quantity,
    })),
  };
}

function computeCodFee(config: CodCheckoutConfigResponse, subtotal: number): number {
  const feeValue = toNumber(config.fee.value);

  if (config.fee.type === "fixed") {
    return Math.max(0, feeValue);
  }

  if (config.fee.type === "percent") {
    return Math.max(0, (subtotal * feeValue) / 100);
  }

  return 0;
}

function normalizeAllowedShipping(config: CodCheckoutConfigResponse): Set<string> {
  const allowed = config.rules.allowed_shipping_methods;
  if (!Array.isArray(allowed) || !allowed.length) {
    return new Set();
  }

  return new Set(allowed.map((code) => code.trim().toLowerCase()).filter(Boolean));
}

function findShippingOption(
  config: CodCheckoutConfigResponse,
  code: string,
): CodCheckoutConfigResponse["shipping_methods"][number] | null {
  if (!Array.isArray(config.shipping_methods)) {
    return null;
  }

  const normalized = code.trim().toLowerCase();

  return (
    config.shipping_methods.find((method) => {
      if (method.code.trim().toLowerCase() === normalized) return true;
      return false;
    }) || null
  );
}

async function tryCreateOrderViaLandlord(
  runtimeHost: string,
  body: CodOrderRequestBody,
): Promise<{ ok: boolean; status: number; data: CodOrderResponse | null; message?: string }> {
  const endpoints = [
    "/api/storefront/cod/order",
    "/api/storefront/cod-order",
  ];

  for (const endpoint of endpoints) {
    const response = await fetchLandlordJson<unknown>(endpoint, {
      runtimeHost,
      method: "POST",
      body,
      cache: "no-store",
    });

    if (!response.ok || !response.data) {
      if (response.status === 403) {
        return {
          ok: false,
          status: 403,
          data: null,
          message: "COD no disponible para este plan.",
        };
      }

      continue;
    }

    const payload =
      response.data && typeof response.data === "object"
        ? (response.data as Record<string, unknown>)
        : null;

    if (!payload) {
      continue;
    }

    const data =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : payload;

    const orderId = String(data.order_id ?? data.orderId ?? "").trim();
    const orderNumber = String(data.order_number ?? data.orderNumber ?? orderId).trim();
    const redirectUrl =
      typeof data.redirect_url === "string"
        ? data.redirect_url
        : typeof data.redirectUrl === "string"
          ? data.redirectUrl
          : null;

    if (!orderId) {
      continue;
    }

    return {
      ok: true,
      status: 200,
      data: {
        order_id: orderId,
        order_number: orderNumber || orderId,
        redirect_url: redirectUrl,
      },
    };
  }

  return {
    ok: false,
    status: 502,
    data: null,
    message: "No se pudo crear la orden COD con el backend de tenant.",
  };
}

async function validateCodOrder(
  runtimeHost: string,
  body: CodOrderRequestBody,
): Promise<CodOrderValidationResult> {
  const config = await resolveCodCheckoutConfig(runtimeHost, body.product_id);

  if (!config.allowed_by_plan) {
    return {
      ok: false,
      status: 403,
      message: "Tu plan no tiene habilitado pago contraentrega.",
      config,
      offer: null,
      resolvedVariantLines: [],
      subtotal: 0,
      shippingTotal: 0,
      discountTotal: 0,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: "",
    };
  }

  if (!config.cod_active) {
    return {
      ok: false,
      status: 422,
      message: "El método pago contraentrega no está activo para esta tienda.",
      config,
      offer: null,
      resolvedVariantLines: [],
      subtotal: 0,
      shippingTotal: 0,
      discountTotal: 0,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: "",
    };
  }

  if (!config.available) {
    return {
      ok: false,
      status: 422,
      message:
        config.reason === "product_blocks_cod"
          ? "Este producto no está disponible para pago contra entrega."
          : "Pago contraentrega no está disponible para este producto.",
      config,
      offer: null,
      resolvedVariantLines: [],
      subtotal: 0,
      shippingTotal: 0,
      discountTotal: 0,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: "",
    };
  }

  if (!config.product_snapshot) {
    return {
      ok: false,
      status: 404,
      message: "No se encontró el producto solicitado.",
      config,
      offer: null,
      resolvedVariantLines: [],
      subtotal: 0,
      shippingTotal: 0,
      discountTotal: 0,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: "",
    };
  }

  if (!isPhysicalProduct(config.product_snapshot.type)) {
    return {
      ok: false,
      status: 422,
      message: "COD no aplica para productos no físicos.",
      config,
      offer: null,
      resolvedVariantLines: [],
      subtotal: 0,
      shippingTotal: 0,
      discountTotal: 0,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: "",
    };
  }

  if (config.product_snapshot.is_saleable === false) {
    return {
      ok: false,
      status: 409,
      message: "El producto seleccionado no tiene stock disponible.",
      config,
      offer: null,
      resolvedVariantLines: [],
      subtotal: 0,
      shippingTotal: 0,
      discountTotal: 0,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: "",
    };
  }

  const selectedCountry = String(body.shipping_address?.country_code || "").trim().toUpperCase();
  if (!selectedCountry) {
    return {
      ok: false,
      status: 422,
      message: "Selecciona un país válido para envío.",
      config,
      offer: null,
      resolvedVariantLines: [],
      subtotal: 0,
      shippingTotal: 0,
      discountTotal: 0,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: "",
    };
  }

  const allowedCountries = (config.rules.countries || []).map((country) => country.toUpperCase());
  if (allowedCountries.length > 0 && !allowedCountries.includes(selectedCountry)) {
    return {
      ok: false,
      status: 422,
      message: "COD no está disponible para el país seleccionado.",
      config,
      offer: null,
      resolvedVariantLines: [],
      subtotal: 0,
      shippingTotal: 0,
      discountTotal: 0,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: "",
    };
  }

  const selectedShipping = String(body.shipping_method_code || "").trim();
  if (!selectedShipping) {
    return {
      ok: false,
      status: 422,
      message: "Selecciona un método de envío válido.",
      config,
      offer: null,
      resolvedVariantLines: [],
      subtotal: 0,
      shippingTotal: 0,
      discountTotal: 0,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: "",
    };
  }

  const allowedShipping = normalizeAllowedShipping(config);
  if (allowedShipping.size > 0 && !allowedShipping.has(selectedShipping.toLowerCase())) {
    return {
      ok: false,
      status: 422,
      message: "El método de envío no está permitido para COD.",
      config,
      offer: null,
      resolvedVariantLines: [],
      subtotal: 0,
      shippingTotal: 0,
      discountTotal: 0,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: "",
    };
  }

  const shippingOption = findShippingOption(config, selectedShipping);
  const shippingTotal = shippingOption ? toNumber(shippingOption.price) : 0;

  const requiredProductAttributes = (config.product_snapshot.attributes || []).map(
    (attribute) => attribute.code,
  );

  let offer: CodOffer | null = null;
  let unitsCount = Math.max(1, Number(body.units_count || 1));
  let subtotal = 0;
  let discountTotal = 0;
  let variantLines: Array<{ productId: number; quantity: number }> = [];

  if (body.mode === "offer") {
    const offerId = Number(body.offer_id);
    offer = config.offers.find((item) => item.id === offerId && item.status) || null;

    if (!offer) {
      return {
        ok: false,
        status: 422,
        message: "La oferta seleccionada no está disponible.",
        config,
        offer: null,
        resolvedVariantLines: [],
        subtotal: 0,
        shippingTotal: 0,
        discountTotal: 0,
        feeTotal: 0,
        grandTotal: 0,
        selectedShippingMethodCode: "",
      };
    }

    if (offer.product_id !== body.product_id) {
      return {
        ok: false,
        status: 422,
        message: "La oferta no corresponde al producto seleccionado.",
        config,
        offer,
        resolvedVariantLines: [],
        subtotal: 0,
        shippingTotal: 0,
        discountTotal: 0,
        feeTotal: 0,
        grandTotal: 0,
        selectedShippingMethodCode: "",
      };
    }

    unitsCount = offer.units_count;

    if (Number(body.units_count) !== unitsCount) {
      return {
        ok: false,
        status: 422,
        message: "Las unidades del combo no coinciden con la oferta seleccionada.",
        config,
        offer,
        resolvedVariantLines: [],
        subtotal: 0,
        shippingTotal: 0,
        discountTotal: 0,
        feeTotal: 0,
        grandTotal: 0,
        selectedShippingMethodCode: "",
      };
    }

    subtotal = toNumber(offer.price);
    discountTotal = Math.max(0, toNumber(offer.compare_at_price) - subtotal);

    const requiredCodes =
      Array.isArray(offer.required_attributes) && offer.required_attributes.length > 0
        ? offer.required_attributes
        : requiredProductAttributes;

    if (offer.selection_strategy === "none") {
      const targetProductId = config.product_snapshot.has_variants
        ? Number(Object.keys(config.product_snapshot.variant_index)[0]) || body.product_id
        : body.product_id;

      variantLines = [{ productId: targetProductId, quantity: unitsCount }];
    } else if (offer.selection_strategy === "single_variant_for_all") {
      const resolved = resolveSingleOrSharedVariant(config, requiredCodes, body.selections);
      if (!resolved.ok) {
        return {
          ok: false,
          status: 422,
          message: resolved.message,
          config,
          offer,
          resolvedVariantLines: [],
          subtotal: 0,
          shippingTotal: 0,
          discountTotal: 0,
          feeTotal: 0,
          grandTotal: 0,
          selectedShippingMethodCode: "",
        };
      }

      variantLines = resolved.lines.map((line) => ({
        ...line,
        quantity: line.quantity * unitsCount,
      }));
    } else {
      const resolved = resolvePerUnitVariants(
        config,
        requiredCodes,
        unitsCount,
        body.selections,
      );

      if (!resolved.ok) {
        return {
          ok: false,
          status: 422,
          message: resolved.message,
          config,
          offer,
          resolvedVariantLines: [],
          subtotal: 0,
          shippingTotal: 0,
          discountTotal: 0,
          feeTotal: 0,
          grandTotal: 0,
          selectedShippingMethodCode: "",
        };
      }

      variantLines = resolved.lines;
    }
  } else {
    if (Number(body.units_count) !== 1) {
      return {
        ok: false,
        status: 422,
        message: "En modo single las unidades deben ser 1.",
        config,
        offer: null,
        resolvedVariantLines: [],
        subtotal: 0,
        shippingTotal: 0,
        discountTotal: 0,
        feeTotal: 0,
        grandTotal: 0,
        selectedShippingMethodCode: "",
      };
    }

    subtotal = toNumber(config.product_snapshot.base_price);

    const requiredCodes = requiredProductAttributes;

    if (requiredCodes.length > 0) {
      const resolved = resolveSingleOrSharedVariant(config, requiredCodes, body.selections);
      if (!resolved.ok) {
        return {
          ok: false,
          status: 422,
          message: resolved.message,
          config,
          offer: null,
          resolvedVariantLines: [],
          subtotal: 0,
          shippingTotal: 0,
          discountTotal: 0,
          feeTotal: 0,
          grandTotal: 0,
          selectedShippingMethodCode: "",
        };
      }

      variantLines = resolved.lines;
    } else {
      variantLines = [{ productId: body.product_id, quantity: 1 }];
    }
  }

  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return {
      ok: false,
      status: 422,
      message: "No se pudo calcular el subtotal del pedido COD.",
      config,
      offer,
      resolvedVariantLines: [],
      subtotal: 0,
      shippingTotal,
      discountTotal,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: selectedShipping,
    };
  }

  if (config.rules.min_total !== null && subtotal < config.rules.min_total) {
    return {
      ok: false,
      status: 422,
      message: `El total mínimo para COD es ${config.rules.min_total}.`,
      config,
      offer,
      resolvedVariantLines: [],
      subtotal,
      shippingTotal,
      discountTotal,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: selectedShipping,
    };
  }

  if (config.rules.max_total !== null && subtotal > config.rules.max_total) {
    return {
      ok: false,
      status: 422,
      message: `El total máximo para COD es ${config.rules.max_total}.`,
      config,
      offer,
      resolvedVariantLines: [],
      subtotal,
      shippingTotal,
      discountTotal,
      feeTotal: 0,
      grandTotal: 0,
      selectedShippingMethodCode: selectedShipping,
    };
  }

  const feeTotal = computeCodFee(config, subtotal);
  const grandTotal = subtotal + shippingTotal + feeTotal;

  return {
    ok: true,
    status: 200,
    config,
    offer,
    resolvedVariantLines: variantLines,
    subtotal,
    shippingTotal,
    discountTotal,
    feeTotal,
    grandTotal,
    selectedShippingMethodCode: selectedShipping,
  };
}

async function createOrderWithCheckoutGraphql(
  runtimeHost: string,
  body: CodOrderRequestBody,
  validation: CodOrderValidationResult,
): Promise<{ ok: boolean; status: number; data: CodOrderResponse | null; message?: string }> {
  const { config } = validation;

  const cartTokenResponse = await bagistoFetch<any>({
    query: CREATE_CART_TOKEN,
    cache: "no-store",
    isCookies: false,
  });

  const sessionToken =
    cartTokenResponse?.body?.data?.createCartToken?.cartToken?.sessionToken;

  if (!sessionToken) {
    return {
      ok: false,
      status: 502,
      data: null,
      message: "No se pudo crear una sesión de carrito para COD.",
    };
  }

  for (const line of validation.resolvedVariantLines) {
    if (!Number.isFinite(line.productId) || line.productId <= 0) {
      return {
        ok: false,
        status: 422,
        data: null,
        message: "No se pudo resolver un variante válida para COD.",
      };
    }

    const addProductResponse = await bagistoFetch<any>({
      query: CREATE_ADD_PRODUCT_IN_CART,
      variables: {
        cartId: null,
        productId: line.productId,
        quantity: line.quantity,
      },
      cache: "no-store",
      guestToken: sessionToken,
      isCookies: false,
    });

    const success =
      addProductResponse?.body?.data?.createAddProductInCart?.addProductInCart?.success;

    if (!success) {
      return {
        ok: false,
        status: 409,
        data: null,
        message: "No se pudo agregar el producto al carrito COD.",
      };
    }
  }

  const { firstName, lastName } = splitFullName(body.shipping_address.name);
  const fallbackEmail = `cod+${Date.now()}@jectstore.local`;

  const saveAddressResponse = await bagistoFetch<any>({
    query: CREATE_CHECKOUT_ADDRESS,
    variables: {
      billingFirstName: firstName,
      billingLastName: lastName,
      billingEmail:
        body.shipping_address.email && body.shipping_address.email.trim() !== ""
          ? body.shipping_address.email.trim()
          : fallbackEmail,
      billingAddress: body.shipping_address.address1,
      billingCity: String(body.shipping_address.city_id || "").trim(),
      billingCountry: String(body.shipping_address.country_code || "").trim().toUpperCase(),
      billingState: String(body.shipping_address.region_id || "").trim(),
      billingPostcode: "000000",
      billingPhoneNumber:
        body.shipping_address.whatsapp && body.shipping_address.whatsapp.trim() !== ""
          ? body.shipping_address.whatsapp.trim()
          : "0000000000",
      billingCompanyName: "",
      useForShipping: true,
    },
    cache: "no-store",
    guestToken: sessionToken,
    isCookies: false,
  });

  const addressSuccess =
    saveAddressResponse?.body?.data?.createCheckoutAddress?.checkoutAddress?.success;

  if (!addressSuccess) {
    return {
      ok: false,
      status: 422,
      data: null,
      message: "No se pudieron guardar los datos de envío COD.",
    };
  }

  const shippingRatesResponse = await bagistoFetch<any>({
    query: GET_CHECKOUT_SHIPPING_RATES,
    variables: { token: "" },
    cache: "no-store",
    guestToken: sessionToken,
    isCookies: false,
  });

  const shippingRates = Array.isArray(
    shippingRatesResponse?.body?.data?.collectionShippingRates,
  )
    ? shippingRatesResponse.body.data.collectionShippingRates
    : [];

  const selectedShippingRate =
    shippingRates.find(
      (rate: any) =>
        String(rate?.code || "") === validation.selectedShippingMethodCode ||
        String(rate?.method || "") === validation.selectedShippingMethodCode,
    ) ||
    shippingRates.find((rate: any) =>
      String(rate?.code || "") === validation.selectedShippingMethodCode,
    );

  if (!selectedShippingRate) {
    return {
      ok: false,
      status: 422,
      data: null,
      message: "El método de envío COD seleccionado no está disponible.",
    };
  }

  const saveShippingResponse = await bagistoFetch<any>({
    query: CREATE_CHECKOUT_SHIPPING_METHODS,
    variables: {
      shippingMethod:
        String(selectedShippingRate?.method || "").trim() ||
        String(selectedShippingRate?.code || "").trim(),
    },
    cache: "no-store",
    guestToken: sessionToken,
    isCookies: false,
  });

  const shippingSaved =
    saveShippingResponse?.body?.data?.createCheckoutShippingMethod?.checkoutShippingMethod
      ?.success;

  if (!shippingSaved) {
    return {
      ok: false,
      status: 422,
      data: null,
      message: "No se pudo guardar el método de envío COD.",
    };
  }

  const paymentMethodsResponse = await bagistoFetch<any>({
    query: GET_CHECKOUT_PAYMENT_METHODS,
    variables: { token: "" },
    cache: "no-store",
    guestToken: sessionToken,
    isCookies: false,
  });

  const paymentMethods = Array.isArray(
    paymentMethodsResponse?.body?.data?.collectionPaymentMethods,
  )
    ? paymentMethodsResponse.body.data.collectionPaymentMethods
    : [];

  const codPaymentMethod = paymentMethods.find(
    (method: any) =>
      String(method?.method || "").toLowerCase() === "cashondelivery" ||
      String(method?.method || "").toLowerCase().includes("cod") ||
      String(method?.title || "").toLowerCase().includes("contraentrega"),
  );

  if (!codPaymentMethod) {
    return {
      ok: false,
      status: 422,
      data: null,
      message: "No hay método de pago COD disponible en checkout.",
    };
  }

  const savePaymentResponse = await bagistoFetch<any>({
    query: CREATE_CHECKOUT_PAYMENT_METHODS,
    variables: {
      paymentMethod: codPaymentMethod.method,
      successUrl: "payment/success",
      failureUrl: "payment/failure",
      cancelUrl: "payment/cancel",
    },
    cache: "no-store",
    guestToken: sessionToken,
    isCookies: false,
  });

  const paymentSaved =
    savePaymentResponse?.body?.data?.createCheckoutPaymentMethod?.checkoutPaymentMethod
      ?.success;

  if (!paymentSaved) {
    return {
      ok: false,
      status: 422,
      data: null,
      message: "No se pudo guardar el método de pago COD.",
    };
  }

  const placeOrderResponse = await bagistoFetch<any>({
    query: CREATE_CHECKOUT_ORDER,
    cache: "no-store",
    guestToken: sessionToken,
    isCookies: false,
  });

  const orderId =
    placeOrderResponse?.body?.data?.createCheckoutOrder?.checkoutOrder?.orderId;

  if (!orderId) {
    return {
      ok: false,
      status: 502,
      data: null,
      message: "No se pudo crear la orden COD.",
    };
  }

  const portalOrder: CodPortalOrder = {
    order_id: String(orderId),
    order_number: String(orderId),
    product_id: config.product_snapshot?.id || body.product_id,
    product_title: config.product_snapshot?.title || "Producto",
    mode: body.mode,
    offer_id: validation.offer?.id,
    offer_snapshot: validation.offer
      ? {
          units_count: validation.offer.units_count,
          price: validation.offer.price,
          compare_at_price: validation.offer.compare_at_price,
          badge_text: validation.offer.badge_text,
          title: validation.offer.title,
        }
      : null,
    customer: {
      name: body.shipping_address.name,
      whatsapp: body.shipping_address.whatsapp,
      email: body.shipping_address.email,
      country_code: body.shipping_address.country_code,
      region_id: body.shipping_address.region_id,
      city_id: body.shipping_address.city_id,
      address1: body.shipping_address.address1,
      address2: body.shipping_address.address2,
    },
    selections: body.selections || null,
    shipping_method_code: validation.selectedShippingMethodCode,
    subtotal: validation.subtotal,
    shipping_total: validation.shippingTotal,
    discount_total: validation.discountTotal,
    cod_fee_total: validation.feeTotal,
    grand_total: validation.grandTotal,
    payment_method: "cashondelivery",
    payment_status: "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  upsertTenantCodOrder(runtimeHost, portalOrder);

  return {
    ok: true,
    status: 200,
    data: {
      order_id: String(orderId),
      order_number: String(orderId),
      redirect_url: null,
    },
  };
}

export async function processCodOrder(
  runtimeHost: string,
  body: CodOrderRequestBody,
): Promise<{ ok: boolean; status: number; data: CodOrderResponse | null; message?: string }> {
  const validation = await validateCodOrder(runtimeHost, body);

  if (!validation.ok) {
    return {
      ok: false,
      status: validation.status,
      data: null,
      message: validation.message,
    };
  }

  const fromLandlord = await tryCreateOrderViaLandlord(runtimeHost, body);
  if (fromLandlord.ok && fromLandlord.data) {
    const portalOrder: CodPortalOrder = {
      order_id: fromLandlord.data.order_id,
      order_number: fromLandlord.data.order_number,
      product_id: validation.config.product_snapshot?.id || body.product_id,
      product_title: validation.config.product_snapshot?.title || "Producto",
      mode: body.mode,
      offer_id: validation.offer?.id,
      offer_snapshot: validation.offer
        ? {
            units_count: validation.offer.units_count,
            price: validation.offer.price,
            compare_at_price: validation.offer.compare_at_price,
            badge_text: validation.offer.badge_text,
            title: validation.offer.title,
          }
        : null,
      customer: {
        name: body.shipping_address.name,
        whatsapp: body.shipping_address.whatsapp,
        email: body.shipping_address.email,
        country_code: body.shipping_address.country_code,
        region_id: body.shipping_address.region_id,
        city_id: body.shipping_address.city_id,
        address1: body.shipping_address.address1,
        address2: body.shipping_address.address2,
      },
      selections: body.selections || null,
      shipping_method_code: validation.selectedShippingMethodCode,
      subtotal: validation.subtotal,
      shipping_total: validation.shippingTotal,
      discount_total: validation.discountTotal,
      cod_fee_total: validation.feeTotal,
      grand_total: validation.grandTotal,
      payment_method: "cashondelivery",
      payment_status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    upsertTenantCodOrder(runtimeHost, portalOrder);

    return fromLandlord;
  }

  if (fromLandlord.status === 403) {
    return fromLandlord;
  }

  return createOrderWithCheckoutGraphql(runtimeHost, body, validation);
}
