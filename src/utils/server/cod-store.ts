import {
  CodOffer,
  CodPortalOrder,
  CodSelectionStrategy,
  CodTenantSettings,
} from "@/types/cod";
import { getDefaultTenantPlanForHost, normalizeHost } from "@/utils/server/tenant-runtime";

interface TenantCodState {
  settings: CodTenantSettings;
  offers: CodOffer[];
  orders: CodPortalOrder[];
  nextOfferId: number;
}

const DEFAULT_SETTINGS = (runtimeHost: string): CodTenantSettings => ({
  plan_name: getDefaultTenantPlanForHost(runtimeHost),
  active: false,
  title: "Pago contraentrega",
  description: "Paga cuando recibas tu pedido.",
  countries: ["CO", "MX", "AR"],
  min_total: null,
  max_total: null,
  allowed_shipping_methods: null,
  fee_type: "none",
  fee_value: null,
  require_email: false,
  require_whatsapp: true,
  modal_enabled: true,
  modal_cta_text: "COMPRA Y PAGA AL RECIBIR",
  modal_helper_text: "Completa tus datos de envío para confirmar tu pedido.",
});

declare global {
  var __JECT_COD_STATE__: Map<string, TenantCodState> | undefined;
}

const globalStore =
  globalThis.__JECT_COD_STATE__ || (globalThis.__JECT_COD_STATE__ = new Map());

const nowIso = () => new Date().toISOString();

const normalizeTenantHost = (runtimeHost: string) => normalizeHost(runtimeHost) || "default";

export function getOrCreateTenantCodState(runtimeHost: string): TenantCodState {
  const host = normalizeTenantHost(runtimeHost);
  const existing = globalStore.get(host);

  if (existing) {
    return existing;
  }

  const created: TenantCodState = {
    settings: DEFAULT_SETTINGS(host),
    offers: [],
    orders: [],
    nextOfferId: 1,
  };

  globalStore.set(host, created);
  return created;
}

export function getTenantCodSettings(runtimeHost: string): CodTenantSettings {
  const state = getOrCreateTenantCodState(runtimeHost);
  return { ...state.settings };
}

export function updateTenantCodSettings(
  runtimeHost: string,
  patch: Partial<CodTenantSettings>,
): CodTenantSettings {
  const state = getOrCreateTenantCodState(runtimeHost);

  state.settings = {
    ...state.settings,
    ...patch,
    countries: Array.isArray(patch.countries)
      ? patch.countries.filter((value) => typeof value === "string" && value.trim() !== "")
      : state.settings.countries,
    allowed_shipping_methods:
      patch.allowed_shipping_methods === null
        ? null
        : Array.isArray(patch.allowed_shipping_methods)
          ? patch.allowed_shipping_methods
              .filter((value) => typeof value === "string" && value.trim() !== "")
              .map((value) => value.trim())
          : state.settings.allowed_shipping_methods,
  };

  return { ...state.settings };
}

function sanitizeOfferInput(
  input: Partial<CodOffer>,
  previous?: CodOffer,
): Omit<CodOffer, "id" | "created_at" | "updated_at"> {
  const strategy = (input.selection_strategy || previous?.selection_strategy ||
    "none") as CodSelectionStrategy;

  return {
    status: Boolean(input.status ?? previous?.status ?? true),
    product_id: Number(input.product_id ?? previous?.product_id ?? 0),
    title: String(input.title ?? previous?.title ?? "").trim(),
    subtitle: input.subtitle == null ? null : String(input.subtitle).trim(),
    badge_text: input.badge_text == null ? null : String(input.badge_text).trim(),
    price: Number(input.price ?? previous?.price ?? 0),
    compare_at_price:
      input.compare_at_price == null
        ? (previous?.compare_at_price ?? null)
        : Number(input.compare_at_price),
    units_count: Math.max(1, Number(input.units_count ?? previous?.units_count ?? 1)),
    selection_strategy: strategy,
    required_attributes: Array.isArray(input.required_attributes)
      ? input.required_attributes
          .map((value) => String(value).trim())
          .filter((value) => value !== "")
      : (previous?.required_attributes ?? []),
    sort_order: Number(input.sort_order ?? previous?.sort_order ?? 0),
  };
}

export function listTenantCodOffers(runtimeHost: string, options?: {
  productId?: number;
  onlyActive?: boolean;
}): CodOffer[] {
  const state = getOrCreateTenantCodState(runtimeHost);
  const productId = options?.productId;

  return state.offers
    .filter((offer) => {
      if (typeof productId === "number" && Number.isFinite(productId)) {
        if (offer.product_id !== productId) return false;
      }
      if (options?.onlyActive && !offer.status) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.id - b.id;
    })
    .map((offer) => ({ ...offer }));
}

export function getTenantCodOffer(runtimeHost: string, offerId: number): CodOffer | null {
  const state = getOrCreateTenantCodState(runtimeHost);
  const found = state.offers.find((offer) => offer.id === offerId);
  return found ? { ...found } : null;
}

export function createTenantCodOffer(
  runtimeHost: string,
  input: Partial<CodOffer>,
): CodOffer {
  const state = getOrCreateTenantCodState(runtimeHost);
  const payload = sanitizeOfferInput(input);
  const now = nowIso();

  const offer: CodOffer = {
    id: state.nextOfferId++,
    ...payload,
    created_at: now,
    updated_at: now,
  };

  state.offers.push(offer);
  return { ...offer };
}

export function updateTenantCodOffer(
  runtimeHost: string,
  offerId: number,
  patch: Partial<CodOffer>,
): CodOffer | null {
  const state = getOrCreateTenantCodState(runtimeHost);
  const idx = state.offers.findIndex((offer) => offer.id === offerId);

  if (idx < 0) {
    return null;
  }

  const next = sanitizeOfferInput(patch, state.offers[idx]);
  const updated: CodOffer = {
    ...state.offers[idx],
    ...next,
    id: offerId,
    created_at: state.offers[idx].created_at,
    updated_at: nowIso(),
  };

  state.offers[idx] = updated;
  return { ...updated };
}

export function deleteTenantCodOffer(runtimeHost: string, offerId: number): boolean {
  const state = getOrCreateTenantCodState(runtimeHost);
  const previousLength = state.offers.length;
  state.offers = state.offers.filter((offer) => offer.id !== offerId);
  return state.offers.length < previousLength;
}

export function listTenantCodOrders(runtimeHost: string): CodPortalOrder[] {
  const state = getOrCreateTenantCodState(runtimeHost);
  return state.orders
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((order) => ({ ...order }));
}

export function upsertTenantCodOrder(runtimeHost: string, order: CodPortalOrder): CodPortalOrder {
  const state = getOrCreateTenantCodState(runtimeHost);
  const idx = state.orders.findIndex((item) => item.order_id === order.order_id);

  if (idx >= 0) {
    state.orders[idx] = {
      ...state.orders[idx],
      ...order,
      updated_at: nowIso(),
    };

    return { ...state.orders[idx] };
  }

  state.orders.push(order);
  return { ...order };
}

export function markTenantCodOrderPaid(
  runtimeHost: string,
  orderId: string,
): CodPortalOrder | null {
  const state = getOrCreateTenantCodState(runtimeHost);
  const idx = state.orders.findIndex((order) => order.order_id === orderId);

  if (idx < 0) {
    return null;
  }

  state.orders[idx] = {
    ...state.orders[idx],
    payment_status: "paid",
    updated_at: nowIso(),
  };

  return { ...state.orders[idx] };
}
