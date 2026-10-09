import {
  BadgePercent,
  Boxes,
  FileText,
  Globe,
  HandCoins,
  LayoutDashboard,
  MapPinned,
  MessageCircleMore,
  Package2,
  Palette,
  ReceiptText,
  Settings2,
  ShieldUser,
  ShoppingBag,
  Truck,
  type LucideIcon,
  Users2,
  WalletCards,
} from "lucide-react";

export const defaultTenantNavIcon: LucideIcon = LayoutDashboard;

export const tenantIconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  home: LayoutDashboard,
  inicio: LayoutDashboard,

  brand: Palette,
  branding: Palette,
  marca: Palette,

  team: Users2,
  staff: Users2,
  users: Users2,
  equipo: Users2,
  usuarios: Users2,

  settings: Settings2,
  configuracion: Settings2,
  configuration: Settings2,

  payments: WalletCards,
  payment: WalletCards,
  pagos: WalletCards,

  "cash-on-delivery": HandCoins,
  cod: HandCoins,
  contraentrega: HandCoins,
  "settings/payments/cash-on-delivery": HandCoins,

  offers: BadgePercent,
  promociones: BadgePercent,
  ofertas: BadgePercent,
  "cod-offers": BadgePercent,
  "sales/cod-offers": BadgePercent,

  orders: ReceiptText,
  pedidos: ReceiptText,
  ventas: ShoppingBag,
  sales: ShoppingBag,

  catalog: Boxes,
  catalogo: Boxes,
  products: Package2,
  producto: Package2,
  productos: Package2,

  content: FileText,
  pages: FileText,
  pagina: FileText,
  paginas: FileText,

  domains: Globe,
  dominio: Globe,
  dominios: Globe,

  locations: MapPinned,
  ubicacion: MapPinned,
  ubicaciones: MapPinned,

  shipping: Truck,
  envio: Truck,
  envios: Truck,

  support: MessageCircleMore,
  soporte: MessageCircleMore,
  whatsapp: MessageCircleMore,

  security: ShieldUser,
  admins: ShieldUser,
  admin: ShieldUser,
};

function normalizeTenantIconKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/-+/g, "/")
    .replace(/-+\//g, "/")
    .replace(/^[-/]+|[-/]+$/g, "");
}

export function resolveTenantNavIcon(identifier?: string | null): LucideIcon {
  const normalized = normalizeTenantIconKey(identifier ?? "");

  if (!normalized) {
    return defaultTenantNavIcon;
  }

  if (tenantIconMap[normalized]) {
    return tenantIconMap[normalized];
  }

  const segments = normalized.split("/").filter(Boolean);

  for (let index = 0; index < segments.length; index += 1) {
    const candidate = segments.slice(index).join("/");

    if (tenantIconMap[candidate]) {
      return tenantIconMap[candidate];
    }
  }

  const leaf = segments.at(-1) ?? normalized;

  return tenantIconMap[leaf] ?? defaultTenantNavIcon;
}
