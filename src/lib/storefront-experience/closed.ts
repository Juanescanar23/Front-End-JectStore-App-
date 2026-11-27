import { NextResponse } from "next/server";
import type { StorefrontClosedError } from "./runtime";

const TITLE = "Esta tienda no está disponible por ahora";
const ASSETS = "/storefront-closed";
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

export function closedStorefrontResponse(
  { storeName, whatsappUrl }: StorefrontClosedError["details"],
  headOnly: boolean,
): NextResponse {
  const brand = storeName
    ? `<div class="flex justify-center"><span class="inline-flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" class="grid h-8 w-8 place-items-center rounded-full bg-neutral text-xs font-bold text-neutral-content">${escapeHtml(([...storeName][0] ?? "").toLocaleUpperCase("es"))}</span>${escapeHtml(storeName)}</span></div>`
    : "";
  const contact = whatsappUrl
    ? `<div class="mt-5 space-y-2"><a class="btn btn-accent w-full" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer"><i class="ph-bold ph-whatsapp-logo text-base" aria-hidden="true"><img src="${ASSETS}/whatsapp-logo.svg" alt="" width="16" height="16"></i>Escribir a la tienda</a></div>`
    : "";
  const html = `<!doctype html>
<html lang="es" data-theme="jectstore">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${TITLE}</title>
  <link rel="stylesheet" href="${ASSETS}/kit.css">
</head>
<body>
  <main class="flex min-h-[calc(100vh-40px)] items-center justify-center px-4 py-10">
    <div class="w-full min-w-0 max-w-sm lg:max-w-md">
      ${brand}
      <div class="caja mt-6 p-6 sm:p-8 lg:p-10">
        <span class="grid h-14 w-14 place-items-center rounded-2xl bg-base-200"><i class="ph-duotone ph-storefront text-[28px]" aria-hidden="true"><img src="${ASSETS}/storefront.svg" alt="" width="28" height="28"></i></span>
        <h1 class="t-seccion mt-4">${TITLE}</h1>
        <p class="mt-2 text-sm text-base-content/70">Vuelve a intentarlo más tarde. Si tienes un pedido en curso, escríbele a la tienda.</p>
        ${contact}
      </div>
      <p class="t-nota mt-6 text-center">Tienda hecha con <a class="underline underline-offset-4" href="https://jectstore.com/" target="_blank" rel="noopener noreferrer">JectStore</a></p>
    </div>
  </main>
</body>
</html>`;

  return new NextResponse(headOnly ? null : html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
