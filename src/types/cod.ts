export type CodFeeType = "none" | "fixed" | "percent";
export type CodOrderMode = "single" | "offer";
export type CodSelectionStrategy =
  | "none"
  | "single_variant_for_all"
  | "per_unit_variant";

export type TenantPlan = "basic" | "emprendedor" | "mipyme" | string;

export type CodAttributeSelection = Record<string, number>;

export interface CodSelectionSingle {
  attributes: CodAttributeSelection;
}

export interface CodSelectionPerUnit {
  attributes: CodAttributeSelection;
}

export interface CodShippingAddressInput {
  name: string;
  whatsapp?: string;
  country_code: string;
  region_id: string;
  city_id: string;
  address1: string;
  address2: string;
  email?: string;
}

export interface CodOrderRequestBody {
  mode: CodOrderMode;
  product_id: number;
  offer_id?: number;
  units_count: number;
  selections?: CodSelectionSingle | CodSelectionPerUnit[];
  shipping_address: CodShippingAddressInput;
  shipping_method_code: string;
}

export interface CodOrderResponse {
  order_id: string;
  order_number: string;
  redirect_url?: string | null;
}

export interface CodLocationCountry {
  code: string;
  name: string;
}

export interface CodLocationRegion {
  id: string;
  name: string;
  code?: string;
}

export interface CodLocationCity {
  id: string;
  name: string;
}

export interface CodShippingMethodOption {
  code: string;
  label: string;
  description?: string | null;
  price: number;
}

export interface CodProductAttributeOption {
  id: number;
  label: string;
}

export interface CodProductAttribute {
  code: string;
  label: string;
  options: CodProductAttributeOption[];
}

export interface CodProductSnapshot {
  id: number;
  title: string;
  image: string | null;
  base_price: number;
  currency_code: string;
  has_variants: boolean;
  is_saleable?: boolean;
  type?: string;
  attributes: CodProductAttribute[];
  variant_index: Record<string, CodAttributeSelection>;
}

export interface CodOffer {
  id: number;
  status: boolean;
  product_id: number;
  title: string;
  subtitle?: string | null;
  badge_text?: string | null;
  price: number;
  compare_at_price?: number | null;
  units_count: number;
  selection_strategy: CodSelectionStrategy;
  required_attributes: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CodRules {
  countries: string[];
  min_total: number | null;
  max_total: number | null;
  allowed_shipping_methods: string[] | null;
}

export interface CodFeeConfig {
  type: CodFeeType;
  value: number | null;
}

export interface CodFieldConfig {
  require_email: boolean;
  require_whatsapp: boolean;
}

export interface CodModalConfig {
  modal_enabled: boolean;
  modal_cta_text: string;
  modal_helper_text: string;
}

export interface CodCheckoutConfigResponse {
  feature_key: "cash_on_delivery";
  plan_name: TenantPlan;
  allowed_by_plan: boolean;
  cod_active: boolean;
  available: boolean;
  reason?: string | null;
  product_allows_cod: boolean;
  product_is_stockable: boolean;
  title: string;
  description: string;
  rules: CodRules;
  fee: CodFeeConfig;
  fields: CodFieldConfig;
  modal: CodModalConfig;
  product_snapshot: CodProductSnapshot | null;
  shipping_methods: CodShippingMethodOption[];
  offers: CodOffer[];
}

export interface CodTenantSettings {
  plan_name: TenantPlan;
  active: boolean;
  title: string;
  description: string;
  countries: string[];
  min_total: number | null;
  max_total: number | null;
  allowed_shipping_methods: string[] | null;
  fee_type: CodFeeType;
  fee_value: number | null;
  require_email: boolean;
  require_whatsapp: boolean;
  modal_enabled: boolean;
  modal_cta_text: string;
  modal_helper_text: string;
}

export interface CodPortalOrder {
  /** Historical order unit, only when the order response explicitly supplies it. */
  currency_code?: string | null;
  order_id: string;
  order_number: string;
  product_id: number;
  product_title: string;
  mode: CodOrderMode;
  offer_id?: number;
  offer_snapshot?: {
    units_count: number;
    price: number;
    compare_at_price?: number | null;
    badge_text?: string | null;
    title?: string;
  } | null;
  customer: {
    name: string;
    whatsapp?: string;
    email?: string;
    country_code: string;
    region_id: string;
    city_id: string;
    address1: string;
    address2: string;
  };
  selections: unknown;
  shipping_method_code: string;
  subtotal: number;
  shipping_total: number;
  discount_total: number;
  cod_fee_total: number;
  grand_total: number;
  payment_method: "cashondelivery";
  payment_status: "pending" | "paid";
  created_at: string;
  updated_at: string;
}
