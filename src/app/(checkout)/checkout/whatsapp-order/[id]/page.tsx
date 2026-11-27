import Link from "next/link";
import { cookies } from "next/headers";
import { READ_WHATSAPP_ORDER } from "@/graphql/checkout/whatsapp-order";
import { bagistoFetch } from "@/utils/bagisto";
import { isWhatsAppOrderId, parseWhatsAppOrder, WHATSAPP_RECEIPT_COOKIE } from "@/utils/whatsapp-order";

export const metadata = { title: "Pedido por WhatsApp", robots: { index: false, follow: false } };

export default async function WhatsAppOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = /^\d+$/.test(id) ? Number(id) : null;
  const cookie = (await cookies()).get(WHATSAPP_RECEIPT_COOKIE)?.value;
  const proof = cookie && /^[a-f0-9]{64}$/.test(cookie) ? cookie : undefined;
  const result = isWhatsAppOrderId(orderId) ? await bagistoFetch<{
    variables: { id: number; receiptToken?: string };
    data?: { readWhatsAppOrder?: unknown };
  }>({
    query: READ_WHATSAPP_ORDER, variables: { id: orderId, receiptToken: proof }, cache: "no-store",
  }).catch(() => null) : null;
  const order = parseWhatsAppOrder(result?.body.data?.readWhatsAppOrder);

  return (
    <section className="mx-auto max-w-xl space-y-4 rounded-2xl border border-sf-border bg-sf-surface p-6 text-sf-content">
      <h1 className="text-2xl font-semibold">
        {order ? order.status === "pending" ? "Pedido creado · Por confirmar" : "Pedido registrado" : "Pedido no disponible"}
      </h1>
      {order && <p>Pedido #{order.number}</p>}
      {order?.whatsappUrl ? (
        <a className="inline-flex rounded-full bg-sf-action px-6 py-3 font-semibold text-sf-action-content focus-visible:outline-2 focus-visible:outline-sf-focus"
          href={order.whatsappUrl} target="_blank" rel="noopener noreferrer">
          Abrir WhatsApp
        </a>
      ) : (
        <p className="text-sf-muted">{order
          ? "El enlace a WhatsApp no está disponible. Puedes contactar a la tienda con el número de pedido."
          : "No pudimos recuperar este pedido para tu sesión."}</p>
      )}
      <Link className="block text-sf-link underline" href="/">Volver a la tienda</Link>
    </section>
  );
}
