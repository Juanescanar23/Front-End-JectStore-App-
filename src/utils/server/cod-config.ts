import {
  CodCheckoutConfigResponse,
  CodOffer,
  CodProductSnapshot,
  CodShippingMethodOption,
} from "@/types/cod";
import { getCodProductSnapshot } from "@/utils/server/cod-product-snapshot";
import {
  getTenantCodSettings,
  listTenantCodOffers,
} from "@/utils/server/cod-store";
import { resolveAllowedByPlan } from "@/utils/server/cod-feature-gate";
import {
  fetchLandlordJson,
  getDefaultTenantPlanForHost,
  normalizeHost,
} from "@/utils/server/tenant-runtime";

const parseString = (value: unknown, fallback = "") => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? fallback : trimmed;
  }

  return fallback;
};

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter((item) => item !== "");
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => String(item || "").trim())
            .filter((item) => item !== "");
        }
      } catch {
        // noop
      }
    }

    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
  }

  return [];
};

const parseOffer = (value: unknown): CodOffer | null => {
  if (!value || typeof value !== "object") return null;

  const unsafe = value as Record<string, unknown>;
  const id = Number(unsafe.id);
  const productId = Number(unsafe.product_id);

  if (!Number.isFinite(id) || !Number.isFinite(productId)) {
    return null;
  }

  return {
    id,
    status: parseBoolean(unsafe.status, true),
    product_id: productId,
    title: parseString(unsafe.title),
    subtitle: parseString(unsafe.subtitle, "") || null,
    badge_text: parseString(unsafe.badge_text, "") || null,
    price: Number(unsafe.price || 0),
    compare_at_price: parseNumber(unsafe.compare_at_price),
    units_count: Math.max(1, Number(unsafe.units_count || 1)),
    selection_strategy:
      unsafe.selection_strategy === "single_variant_for_all" ||
      unsafe.selection_strategy === "per_unit_variant"
        ? (unsafe.selection_strategy as "single_variant_for_all" | "per_unit_variant")
        : "none",
    required_attributes: parseStringArray(unsafe.required_attributes),
    sort_order: Number(unsafe.sort_order || 0),
    created_at:
      parseString(unsafe.created_at, "") || new Date().toISOString(),
    updated_at:
      parseString(unsafe.updated_at, "") || new Date().toISOString(),
  };
};

const parseOffers = (value: unknown): CodOffer[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map(parseOffer)
    .filter((offer): offer is CodOffer => Boolean(offer))
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.id - b.id;
    });
};

const parseShippingMethods = (value: unknown): CodShippingMethodOption[] => {
  if (!Array.isArray(value)) return [];

  const rows: CodShippingMethodOption[] = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const unsafe = entry as Record<string, unknown>;
    const code = parseString(unsafe.code || unsafe.method, "");
    if (!code) return;

    const price = Number(unsafe.price || 0);
    if (!Number.isFinite(price)) return;

    rows.push({
      code,
      label:
        parseString(unsafe.label, "") ||
        parseString(unsafe.title, "") ||
        code,
      description: parseString(unsafe.description, "") || null,
      price,
    });
  });

  return rows;
};

const parseProductSnapshot = (value: unknown): CodProductSnapshot | null => {
  if (!value || typeof value !== "object") return null;

  const unsafe = value as Record<string, unknown>;
  const productId = Number(unsafe.id ?? unsafe.product_id);

  if (!Number.isFinite(productId)) {
    return null;
  }

  const attributes = Array.isArray(unsafe.attributes)
    ? unsafe.attributes
        .map((attribute) => {
          if (!attribute || typeof attribute !== "object") return null;
          const unsafeAttribute = attribute as Record<string, unknown>;
          const code = parseString(unsafeAttribute.code, "");
          if (!code) return null;

          return {
            code,
            label:
              parseString(unsafeAttribute.label, "") ||
              parseString(unsafeAttribute.admin_name, "") ||
              code,
            options: Array.isArray(unsafeAttribute.options)
              ? unsafeAttribute.options
                  .map((option) => {
                    if (!option || typeof option !== "object") return null;
                    const unsafeOption = option as Record<string, unknown>;
                    const optionId = Number(unsafeOption.id);
                    if (!Number.isFinite(optionId)) return null;

                    return {
                      id: optionId,
                      label:
                        parseString(unsafeOption.label, "") ||
                        parseString(unsafeOption.adminName, "") ||
                        String(optionId),
                    };
                  })
                  .filter((option): option is { id: number; label: string } =>
                    Boolean(option),
                  )
              : [],
          };
        })
        .filter(
          (attribute): attribute is {
            code: string;
            label: string;
            options: Array<{ id: number; label: string }>;
          } => Boolean(attribute),
        )
    : [];

  const variantIndexRaw =
    unsafe.variant_index && typeof unsafe.variant_index === "object"
      ? (unsafe.variant_index as Record<string, unknown>)
      : {};

  const variantIndex = Object.entries(variantIndexRaw).reduce<
    Record<string, Record<string, number>>
  >((acc, [variantId, selection]) => {
    if (!selection || typeof selection !== "object") return acc;

    const row = Object.entries(selection as Record<string, unknown>).reduce<
      Record<string, number>
    >((map, [attributeCode, attributeOptionId]) => {
      const parsed = Number(attributeOptionId);
      if (!Number.isFinite(parsed)) return map;
      map[attributeCode] = parsed;
      return map;
    }, {});

    acc[variantId] = row;
    return acc;
  }, {});

  return {
    id: productId,
    title: parseString(unsafe.title || unsafe.name, "Producto"),
    image: parseString(unsafe.image, "") || null,
    base_price: Number(unsafe.base_price ?? unsafe.price ?? 0),
    currency_code: parseString(unsafe.currency_code, "USD"),
    has_variants: parseBoolean(unsafe.has_variants, attributes.length > 0),
    is_saleable: parseBoolean(unsafe.is_saleable, true),
    type: parseString(unsafe.type, ""),
    attributes,
    variant_index: variantIndex,
  };
};

function normalizeCodConfigFromPayload(
  payload: unknown,
  runtimeHost: string,
): CodCheckoutConfigResponse | null {
  if (!payload || typeof payload !== "object") return null;

  const unsafe = payload as Record<string, unknown>;
  const dataContainer =
    unsafe.data && typeof unsafe.data === "object"
      ? (unsafe.data as Record<string, unknown>)
      : unsafe;

  const fallbackPlan = getDefaultTenantPlanForHost(runtimeHost);
  const { plan, allowed } = resolveAllowedByPlan(dataContainer, fallbackPlan);
  const rulesObj =
    dataContainer.rules && typeof dataContainer.rules === "object"
      ? (dataContainer.rules as Record<string, unknown>)
      : {};
  const feeObj =
    dataContainer.fee && typeof dataContainer.fee === "object"
      ? (dataContainer.fee as Record<string, unknown>)
      : {};
  const fieldsObj =
    dataContainer.fields && typeof dataContainer.fields === "object"
      ? (dataContainer.fields as Record<string, unknown>)
      : {};
  const modalObj =
    dataContainer.modal && typeof dataContainer.modal === "object"
      ? (dataContainer.modal as Record<string, unknown>)
      : {};

  const countries = parseStringArray(
    rulesObj.countries ??
      dataContainer.countries ??
      dataContainer.jectstore_cod_countries,
  );

  const allowedShippingMethods = parseStringArray(
    rulesObj.allowed_shipping_methods ??
      dataContainer.allowed_shipping_methods,
  );

  const shippingMethods = parseShippingMethods(
    dataContainer.shipping_methods || dataContainer.shippingMethods,
  );

  const requestProductId = Number(
    dataContainer.product_id ??
      dataContainer.productId ??
      unsafe.product_id ??
      unsafe.productId ??
      0,
  );
  const offers = parseOffers(dataContainer.offers).filter((offer) => {
    if (!offer.status) return false;
    if (!Number.isFinite(requestProductId) || requestProductId <= 0) return true;
    return offer.product_id === requestProductId;
  });

  const productSnapshot =
    parseProductSnapshot(dataContainer.product_snapshot || dataContainer.product) ||
    null;
  const codActive = parseBoolean(
    dataContainer.cod_active ?? dataContainer.active ?? dataContainer.codEnabled,
    false,
  );
  const productAllowsCod = parseBoolean(
    dataContainer.product_allows_cod,
    true,
  );
  const productIsStockable = parseBoolean(
    dataContainer.product_is_stockable,
    true,
  );

  return {
    feature_key: "cash_on_delivery",
    plan_name: plan,
    allowed_by_plan: allowed,
    cod_active: codActive,
    available: parseBoolean(
      dataContainer.available,
      allowed && codActive && productAllowsCod,
    ),
    reason: parseString(dataContainer.reason ?? unsafe.reason, "") || null,
    product_allows_cod: productAllowsCod,
    product_is_stockable: productIsStockable,
    title: parseString(dataContainer.title, "Pago contraentrega"),
    description: parseString(
      dataContainer.description,
      "Paga cuando recibas tu pedido.",
    ),
    rules: {
      countries,
      min_total: parseNumber(
        rulesObj.min_total ?? dataContainer.min_total,
      ),
      max_total: parseNumber(
        rulesObj.max_total ?? dataContainer.max_total,
      ),
      allowed_shipping_methods:
        allowedShippingMethods.length > 0 ? allowedShippingMethods : null,
    },
    fee: {
      type:
        dataContainer.fee_type === "fixed" ||
        dataContainer.fee_type === "percent"
          ? (dataContainer.fee_type as "fixed" | "percent")
          : feeObj.type === "fixed" || feeObj.type === "percent"
            ? (feeObj.type as "fixed" | "percent")
            : "none",
      value: parseNumber(
        feeObj.value ??
          dataContainer.fee_value ??
          dataContainer.cod_fee_value,
      ),
    },
    fields: {
      require_email: parseBoolean(
        dataContainer.require_email ?? fieldsObj.require_email,
        false,
      ),
      require_whatsapp: parseBoolean(
        dataContainer.require_whatsapp ?? fieldsObj.require_whatsapp,
        true,
      ),
    },
    modal: {
      modal_enabled: parseBoolean(
        dataContainer.modal_enabled ??
          modalObj.modal_enabled ??
          dataContainer.cod_modal_enabled,
        true,
      ),
      modal_cta_text: parseString(
        dataContainer.modal_cta_text ?? modalObj.modal_cta_text,
        "COMPRA Y PAGA AL RECIBIR",
      ),
      modal_helper_text: parseString(
        dataContainer.modal_helper_text ??
          modalObj.modal_helper_text,
        "Completa tus datos de envío para confirmar tu pedido.",
      ),
    },
    product_snapshot: productSnapshot,
    shipping_methods:
      shippingMethods.length > 0
        ? shippingMethods
        : allowedShippingMethods.map((code) => ({
            code,
            label: code,
            description: null,
            price: 0,
          })),
    offers,
  };
}

async function fetchLandlordCodConfig(
  runtimeHost: string,
  productId: number,
): Promise<CodCheckoutConfigResponse | null> {
  const normalizedHost = normalizeHost(runtimeHost);

  if (!normalizedHost) {
    return null;
  }

  const endpoints = [
    "/api/storefront/cod/config",
    "/api/storefront/cod-config",
  ];

  for (const endpoint of endpoints) {
    const response = await fetchLandlordJson<unknown>(endpoint, {
      runtimeHost: normalizedHost,
      query: { product_id: productId },
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok || !response.data) {
      continue;
    }

    const withProductId =
      typeof response.data === "object" && response.data !== null
        ? ({
            ...(response.data as Record<string, unknown>),
            product_id: productId,
          } as unknown)
        : response.data;

    const normalized = normalizeCodConfigFromPayload(withProductId, normalizedHost);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function buildLocalCodConfig(
  runtimeHost: string,
  productSnapshot: CodProductSnapshot | null,
): CodCheckoutConfigResponse {
  const settings = getTenantCodSettings(runtimeHost);
  const { plan, allowed } = resolveAllowedByPlan(
    { plan_name: settings.plan_name },
    settings.plan_name,
  );

  const offers = productSnapshot
    ? listTenantCodOffers(runtimeHost, {
        productId: productSnapshot.id,
        onlyActive: true,
      })
    : [];

  const shippingMethods = (settings.allowed_shipping_methods || []).map((code) => ({
    code,
    label: code,
    description: null,
    price: 0,
  }));

  return {
    feature_key: "cash_on_delivery",
    plan_name: plan,
    allowed_by_plan: allowed,
    cod_active: settings.active,
    available:
      allowed &&
      settings.active &&
      (productSnapshot?.is_saleable ?? true),
    reason:
      !allowed
        ? "plan_not_allowed"
        : !settings.active
          ? "cod_inactive"
          : productSnapshot?.is_saleable === false
            ? "product_not_saleable"
            : null,
    product_allows_cod: true,
    product_is_stockable: productSnapshot?.is_saleable !== false,
    title: settings.title,
    description: settings.description,
    rules: {
      countries: settings.countries,
      min_total: settings.min_total,
      max_total: settings.max_total,
      allowed_shipping_methods: settings.allowed_shipping_methods,
    },
    fee: {
      type: settings.fee_type,
      value: settings.fee_value,
    },
    fields: {
      require_email: settings.require_email,
      require_whatsapp: settings.require_whatsapp,
    },
    modal: {
      modal_enabled: settings.modal_enabled,
      modal_cta_text: settings.modal_cta_text,
      modal_helper_text: settings.modal_helper_text,
    },
    product_snapshot: productSnapshot,
    shipping_methods: shippingMethods,
    offers,
  };
}

export async function resolveCodCheckoutConfig(
  runtimeHost: string,
  productId: number,
): Promise<CodCheckoutConfigResponse> {
  const fromLandlord = await fetchLandlordCodConfig(runtimeHost, productId);
  if (fromLandlord) {
    if (!fromLandlord.product_snapshot) {
      fromLandlord.product_snapshot = await getCodProductSnapshot(productId);
    }

    return fromLandlord;
  }

  const productSnapshot = await getCodProductSnapshot(productId);
  return buildLocalCodConfig(runtimeHost, productSnapshot);
}
