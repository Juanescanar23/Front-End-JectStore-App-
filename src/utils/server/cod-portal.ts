import {
  CodOffer,
  CodPortalOrder,
  CodTenantSettings,
} from "@/types/cod";
import {
  createTenantCodOffer,
  deleteTenantCodOffer,
  getTenantCodSettings,
  listTenantCodOffers,
  listTenantCodOrders,
  markTenantCodOrderPaid,
  updateTenantCodOffer,
  updateTenantCodSettings,
} from "@/utils/server/cod-store";
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

const parseNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter((item) => item !== "");
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

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

function normalizeSettingsPayload(
  runtimeHost: string,
  payload: unknown,
): CodTenantSettings | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const unsafe = payload as Record<string, unknown>;
  const data =
    unsafe.data && typeof unsafe.data === "object"
      ? (unsafe.data as Record<string, unknown>)
      : unsafe;

  const fallback = getTenantCodSettings(runtimeHost);
  const minTotal =
    data.min_total === undefined
      ? fallback.min_total
      : parseNumberOrNull(data.min_total);
  const maxTotal =
    data.max_total === undefined
      ? fallback.max_total
      : parseNumberOrNull(data.max_total);
  const feeValue =
    data.fee_value === undefined
      ? fallback.fee_value
      : parseNumberOrNull(data.fee_value);

  return {
    plan_name: parseString(
      data.plan_name,
      getDefaultTenantPlanForHost(runtimeHost),
    ),
    active: parseBoolean(data.active ?? data.cod_active, fallback.active),
    title: parseString(data.title, fallback.title),
    description: parseString(data.description, fallback.description),
    countries: parseStringArray(data.countries).length
      ? parseStringArray(data.countries)
      : fallback.countries,
    min_total: minTotal,
    max_total: maxTotal,
    allowed_shipping_methods:
      parseStringArray(data.allowed_shipping_methods).length > 0
        ? parseStringArray(data.allowed_shipping_methods)
        : data.allowed_shipping_methods === null
          ? null
          : fallback.allowed_shipping_methods,
    fee_type:
      data.fee_type === "fixed" || data.fee_type === "percent"
        ? data.fee_type
        : fallback.fee_type,
    fee_value: feeValue,
    require_email: parseBoolean(data.require_email, fallback.require_email),
    require_whatsapp: parseBoolean(
      data.require_whatsapp,
      fallback.require_whatsapp,
    ),
    modal_enabled: parseBoolean(data.modal_enabled, fallback.modal_enabled),
    modal_cta_text: parseString(data.modal_cta_text, fallback.modal_cta_text),
    modal_helper_text: parseString(
      data.modal_helper_text,
      fallback.modal_helper_text,
    ),
  };
}

export async function getPortalCodSettings(
  runtimeHost: string,
): Promise<CodTenantSettings> {
  const normalizedHost = normalizeHost(runtimeHost);

  const endpoints = [
    "/api/portal/cod/settings",
    "/api/portal/settings/payments/cash-on-delivery",
  ];

  for (const endpoint of endpoints) {
    const response = await fetchLandlordJson<unknown>(endpoint, {
      runtimeHost: normalizedHost,
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok || !response.data) continue;

    const normalized = normalizeSettingsPayload(normalizedHost, response.data);
    if (normalized) {
      return normalized;
    }
  }

  return getTenantCodSettings(normalizedHost);
}

export async function savePortalCodSettings(
  runtimeHost: string,
  input: Partial<CodTenantSettings>,
): Promise<CodTenantSettings> {
  const normalizedHost = normalizeHost(runtimeHost);

  const endpoints = [
    "/api/portal/cod/settings",
    "/api/portal/settings/payments/cash-on-delivery",
  ];

  for (const endpoint of endpoints) {
    const response = await fetchLandlordJson<unknown>(endpoint, {
      runtimeHost: normalizedHost,
      method: "PUT",
      cache: "no-store",
      body: input,
    });

    if (!response.ok || !response.data) continue;

    const normalized = normalizeSettingsPayload(normalizedHost, response.data);
    if (normalized) {
      return normalized;
    }
  }

  return updateTenantCodSettings(normalizedHost, input);
}

function normalizeOffersPayload(payload: unknown): CodOffer[] {
  if (!payload || typeof payload !== "object") return [];

  const unsafe = payload as Record<string, unknown>;

  const rows = Array.isArray(unsafe.offers)
    ? unsafe.offers
    : unsafe.data && typeof unsafe.data === "object"
      ? Array.isArray((unsafe.data as Record<string, unknown>).offers)
        ? ((unsafe.data as Record<string, unknown>).offers as unknown[])
        : []
      : [];

  return rows
    .map((value) => {
      if (!value || typeof value !== "object") return null;
      const unsafeOffer = value as Record<string, unknown>;
      const id = Number(unsafeOffer.id);
      const productId = Number(unsafeOffer.product_id);

      if (!Number.isFinite(id) || !Number.isFinite(productId)) {
        return null;
      }

      return {
        id,
        status: parseBoolean(unsafeOffer.status, true),
        product_id: productId,
        title: parseString(unsafeOffer.title),
        subtitle: parseString(unsafeOffer.subtitle, "") || null,
        badge_text: parseString(unsafeOffer.badge_text, "") || null,
        price: Number(unsafeOffer.price || 0),
        compare_at_price: parseNumberOrNull(unsafeOffer.compare_at_price),
        units_count: Math.max(1, Number(unsafeOffer.units_count || 1)),
        selection_strategy:
          unsafeOffer.selection_strategy === "single_variant_for_all" ||
          unsafeOffer.selection_strategy === "per_unit_variant"
            ? unsafeOffer.selection_strategy
            : "none",
        required_attributes: parseStringArray(unsafeOffer.required_attributes),
        sort_order: Number(unsafeOffer.sort_order || 0),
        created_at: parseString(
          unsafeOffer.created_at,
          new Date().toISOString(),
        ),
        updated_at: parseString(
          unsafeOffer.updated_at,
          new Date().toISOString(),
        ),
      } as CodOffer;
    })
    .filter((offer): offer is CodOffer => Boolean(offer));
}

export async function listPortalCodOffers(
  runtimeHost: string,
  productId?: number,
): Promise<CodOffer[]> {
  const normalizedHost = normalizeHost(runtimeHost);

  const endpoints = [
    "/api/portal/sales/cod-offers",
    "/api/portal/cod-offers",
  ];

  for (const endpoint of endpoints) {
    const response = await fetchLandlordJson<unknown>(endpoint, {
      runtimeHost: normalizedHost,
      method: "GET",
      cache: "no-store",
      query: productId ? { product_id: productId } : undefined,
    });

    if (!response.ok || !response.data) continue;

    const rows = normalizeOffersPayload(response.data);
    if (rows.length > 0 || response.status === 200) {
      return rows;
    }
  }

  return listTenantCodOffers(normalizedHost, {
    productId,
  });
}

export async function createPortalCodOffer(
  runtimeHost: string,
  input: Partial<CodOffer>,
): Promise<CodOffer> {
  const normalizedHost = normalizeHost(runtimeHost);

  const endpoints = [
    "/api/portal/sales/cod-offers",
    "/api/portal/cod-offers",
  ];

  for (const endpoint of endpoints) {
    const response = await fetchLandlordJson<unknown>(endpoint, {
      runtimeHost: normalizedHost,
      method: "POST",
      cache: "no-store",
      body: input,
    });

    if (!response.ok || !response.data) continue;

    const rows = normalizeOffersPayload(response.data);
    if (rows.length > 0) {
      return rows[0];
    }
  }

  return createTenantCodOffer(normalizedHost, input);
}

export async function updatePortalCodOffer(
  runtimeHost: string,
  offerId: number,
  patch: Partial<CodOffer>,
): Promise<CodOffer | null> {
  const normalizedHost = normalizeHost(runtimeHost);

  const endpoints = [
    `/api/portal/sales/cod-offers/${offerId}`,
    `/api/portal/cod-offers/${offerId}`,
  ];

  for (const endpoint of endpoints) {
    const response = await fetchLandlordJson<unknown>(endpoint, {
      runtimeHost: normalizedHost,
      method: "PUT",
      cache: "no-store",
      body: patch,
    });

    if (!response.ok || !response.data) continue;

    const rows = normalizeOffersPayload(response.data);
    if (rows.length > 0) {
      return rows[0];
    }
  }

  return updateTenantCodOffer(normalizedHost, offerId, patch);
}

export async function deletePortalCodOffer(
  runtimeHost: string,
  offerId: number,
): Promise<boolean> {
  const normalizedHost = normalizeHost(runtimeHost);

  const endpoints = [
    `/api/portal/sales/cod-offers/${offerId}`,
    `/api/portal/cod-offers/${offerId}`,
  ];

  for (const endpoint of endpoints) {
    const response = await fetchLandlordJson<unknown>(endpoint, {
      runtimeHost: normalizedHost,
      method: "DELETE",
      cache: "no-store",
    });

    if (response.ok) {
      return true;
    }
  }

  return deleteTenantCodOffer(normalizedHost, offerId);
}

export async function listPortalCodOrders(
  runtimeHost: string,
): Promise<CodPortalOrder[]> {
  const normalizedHost = normalizeHost(runtimeHost);

  const endpoints = [
    "/api/portal/orders?payment_method=cashondelivery",
    "/api/portal/cod/orders",
  ];

  for (const endpoint of endpoints) {
    const response = await fetchLandlordJson<unknown>(endpoint, {
      runtimeHost: normalizedHost,
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok || !response.data || typeof response.data !== "object") {
      continue;
    }

    const unsafe = response.data as Record<string, unknown>;
    const rows = Array.isArray(unsafe.orders)
      ? unsafe.orders
      : unsafe.data && typeof unsafe.data === "object"
        ? Array.isArray((unsafe.data as Record<string, unknown>).orders)
          ? ((unsafe.data as Record<string, unknown>).orders as unknown[])
          : []
        : [];

    if (rows.length === 0) {
      return [];
    }

    return rows
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        return row as CodPortalOrder;
      })
      .filter((order): order is CodPortalOrder => Boolean(order));
  }

  return listTenantCodOrders(normalizedHost);
}

export async function markPortalCodOrderAsPaid(
  runtimeHost: string,
  orderId: string,
): Promise<CodPortalOrder | null> {
  const normalizedHost = normalizeHost(runtimeHost);

  const endpoints = [
    `/api/portal/orders/${orderId}/cod/mark-paid`,
    `/api/portal/cod/orders/${orderId}/mark-paid`,
  ];

  for (const endpoint of endpoints) {
    const response = await fetchLandlordJson<unknown>(endpoint, {
      runtimeHost: normalizedHost,
      method: "POST",
      cache: "no-store",
    });

    if (!response.ok || !response.data) continue;

    if (typeof response.data === "object" && response.data !== null) {
      const unsafe = response.data as Record<string, unknown>;
      const order = unsafe.order || unsafe.data;
      if (order && typeof order === "object") {
        return order as CodPortalOrder;
      }
    }

    break;
  }

  return markTenantCodOrderPaid(normalizedHost, orderId);
}
