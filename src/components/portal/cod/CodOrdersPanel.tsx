"use client";

import { CodPortalOrder } from "@/types/cod";
import { Price } from "@/components/theme/ui/Price";
import { useCustomToast } from "@/utils/hooks/useToast";
import { useEffect, useState } from "react";

export default function CodOrdersPanel() {
  const { showToast } = useCustomToast();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<CodPortalOrder[]>([]);
  const [markingOrderId, setMarkingOrderId] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await fetch("/api/portal/orders", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        orders?: CodPortalOrder[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "No se pudieron cargar órdenes COD.");
      }

      setOrders(Array.isArray(payload.orders) ? payload.orders : []);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "No se pudieron cargar órdenes COD.",
        "warning",
      );
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Hydrate persisted orders from the external API, not from render props.
    // Loading starts true; reloads are triggered only by the payment event.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const markPaid = async (orderId: string) => {
    setMarkingOrderId(orderId);

    try {
      const response = await fetch(`/api/portal/orders/${orderId}/cod/mark-paid`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo marcar la orden como pagada.");
      }

      setLoading(true);
      await load();
      showToast("Orden marcada como pagada.", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "No se pudo marcar la orden como pagada.",
        "warning",
      );
    } finally {
      setMarkingOrderId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-neutral-500">Cargando órdenes COD...</p>;
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
        No hay órdenes COD registradas.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <article key={order.order_id} className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Orden #{order.order_number}</p>
              <p className="text-xs text-neutral-500">{new Date(order.created_at).toLocaleString()}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700">
                Contraentrega
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  order.payment_status === "paid"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {order.payment_status === "paid" ? "Pago realizado" : "Pago pendiente"}
              </span>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-neutral-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cliente</p>
              <p className="mt-1 text-sm font-medium">{order.customer.name}</p>
              <p className="text-xs text-neutral-600">WhatsApp: {order.customer.whatsapp || "-"}</p>
              <p className="text-xs text-neutral-600">Email: {order.customer.email || "-"}</p>
              <p className="mt-1 text-xs text-neutral-600">
                {order.customer.country_code} / {order.customer.region_id} / {order.customer.city_id}
              </p>
              <p className="text-xs text-neutral-600">{order.customer.address1}</p>
              <p className="text-xs text-neutral-600">{order.customer.address2}</p>
            </div>

            <div className="rounded-lg border border-neutral-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Resumen</p>
              <p className="mt-1 text-sm font-medium">{order.product_title}</p>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Subtotal</span>
                  <Price amount={String(order.subtotal)} className="font-medium" currencyCode="USD" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Envío</span>
                  <Price amount={String(order.shipping_total)} className="font-medium" currencyCode="USD" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Fee COD</span>
                  <Price amount={String(order.cod_fee_total)} className="font-medium" currencyCode="USD" />
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-neutral-200 pt-1 text-sm font-semibold">
                  <span>Total</span>
                  <Price amount={String(order.grand_total)} className="font-semibold" currencyCode="USD" />
                </div>
              </div>
            </div>
          </div>

          {order.payment_status === "pending" ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => markPaid(order.order_id)}
                disabled={markingOrderId === order.order_id}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
              >
                {markingOrderId === order.order_id ? "Procesando..." : "Marcar como pagado"}
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
