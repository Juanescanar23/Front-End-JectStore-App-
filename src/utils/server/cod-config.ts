import "server-only";

import {
  CodCheckoutConfigResponse,
  CodOffer,
  CodProductSnapshot,
  CodShippingMethodOption,
} from "@/types/cod";
import { getCodProductSnapshot } from "@/utils/server/cod-product-snapshot";
import { resolveAllowedByPlan } from "@/utils/server/cod-feature-gate";
import { normalizeCurrencyCode } from "@/utils/storefront-money";
import { fetchNativeCodConfig } from "./cod-config-reader";
import { StorefrontConnectionUnavailable } from "./client-context";

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

  const currencyCode = normalizeCurrencyCode(unsafe.currency_code);
  if (!currencyCode) return null;

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
    currency_code: currencyCode,
    has_variants: parseBoolean(unsafe.has_variants, attributes.length > 0),
    is_saleable: parseBoolean(unsafe.is_saleable, true),
    type: parseString(unsafe.type, ""),
    attributes,
    variant_index: variantIndex,
  };
};

function normalizeCodConfigFromPayload(
  payload: unknown,
): CodCheckoutConfigResponse | null {
  if (!payload || typeof payload !== "object") return null;

  const unsafe = payload as Record<string, unknown>;
  const dataContainer =
    unsafe.data && typeof unsafe.data === "object"
      ? (unsafe.data as Record<string, unknown>)
      : unsafe;

  const { plan, allowed } = resolveAllowedByPlan(dataContainer, "basic");
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
    false,
  );
  const productIsStockable = parseBoolean(
    dataContainer.product_is_stockable,
    false,
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

/** Availability/plan decisions must be explicit facts from the canonical backend. */
function canonicalConfigPayload(payload: unknown, productId: number): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new StorefrontConnectionUnavailable();
  const envelope = payload as Record<string, unknown>;
  const data = Object.hasOwn(envelope, "data") ? envelope.data : envelope;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new StorefrontConnectionUnavailable();
  const value = data as Record<string, unknown>;
  if (value.feature_key !== "cash_on_delivery" || value.product_id !== productId
    || typeof value.plan_name !== "string" || !value.plan_name.trim() || value.plan_name.length > 100
    || ["allowed_by_plan", "cod_active", "available", "product_allows_cod"].some(key => typeof value[key] !== "boolean")
    || !(typeof value.product_is_stockable === "boolean" || value.product_is_stockable === null)
    || !(value.reason === null || typeof value.reason === "string" && /^[a-z0-9_:-]{1,120}$/.test(value.reason))
    || !Object.hasOwn(value, "product_snapshot")) throw new StorefrontConnectionUnavailable();
  const snapshot = value.product_snapshot;
  if (snapshot !== null && (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
    || Number((snapshot as Record<string, unknown>).id) !== productId)) throw new StorefrontConnectionUnavailable();
  if (value.available && (!value.allowed_by_plan || !value.cod_active || !value.product_allows_cod
    || value.product_is_stockable !== true || value.reason !== null)) throw new StorefrontConnectionUnavailable();
  return value;
}

export async function resolveCodCheckoutConfig(
  runtimeHost: string,
  productId: number,
): Promise<CodCheckoutConfigResponse> {
  const payload = canonicalConfigPayload(await fetchNativeCodConfig(runtimeHost, productId), productId);
  const config = normalizeCodConfigFromPayload(payload);
  if (!config) throw new StorefrontConnectionUnavailable();
  // A product metadata read cannot grant availability or replace a backend
  // denial. It only completes an otherwise confirmed, matching product.
  if (config.available && !config.product_snapshot) {
    const snapshot = await getCodProductSnapshot(productId).catch(() => null);
    if (snapshot?.id === productId) config.product_snapshot = snapshot;
  }
  if (config.available && !config.product_snapshot) {
    config.available = false;
    config.reason ||= "product_snapshot_unavailable";
  }
  return config;
}
