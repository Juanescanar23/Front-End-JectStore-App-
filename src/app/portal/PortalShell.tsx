"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import CodOffersPanel from "@/components/portal/cod/CodOffersPanel";
import CodOrdersPanel from "@/components/portal/cod/CodOrdersPanel";
import CodSettingsPanel from "@/components/portal/cod/CodSettingsPanel";
import { resolveTenantNavIcon } from "@/utils/design-system/tenantIconMap";

const navItems = [
  {
    href: "/portal/settings/payments/cash-on-delivery",
    label: "Settings COD",
    iconKey: "settings/payments/cash-on-delivery",
  },
  {
    href: "/portal/sales/cod-offers",
    label: "Ofertas COD",
    iconKey: "sales/cod-offers",
  },
  {
    href: "/portal/orders",
    label: "Pedidos COD",
    iconKey: "orders",
  },
];

function DashboardHint() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Portal COD</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Selecciona una sección para administrar pago contraentrega.
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-neutral-700">
        <li>`/portal/settings/payments/cash-on-delivery`</li>
        <li>`/portal/sales/cod-offers`</li>
        <li>`/portal/orders`</li>
      </ul>
    </div>
  );
}

export default function PortalShell() {
  const pathname = usePathname();

  const content = (() => {
    if (pathname.startsWith("/portal/settings/payments/cash-on-delivery")) {
      return <CodSettingsPanel />;
    }

    if (pathname.startsWith("/portal/sales/cod-offers")) {
      return <CodOffersPanel />;
    }

    if (pathname.startsWith("/portal/orders")) {
      return <CodOrdersPanel />;
    }

    return <DashboardHint />;
  })();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold">Portal Reseller</h1>
          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = resolveTenantNavIcon(item.iconKey);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition",
                    active
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.85} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">{content}</main>
    </div>
  );
}
