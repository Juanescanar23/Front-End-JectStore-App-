import type { NextStoreIntroSettings } from "./document";

/** The existing public fallback, now also editable through typed sections. */
export const STORE_INTRO_DEFAULTS: Readonly<NextStoreIntroSettings> = Object.freeze({
  eyebrow: "Tienda online",
  heading: "Compra sin fricción aunque la portada del tenant todavía no esté personalizada.",
  body: "Dejamos un fallback comercial estable para que la tienda siga navegable mientras se termina de ajustar el contenido de la home.",
  primary_label: "Ver catálogo",
  primary_url: "/search",
  secondary_label: "Ingresar",
  secondary_url: "/customer/login",
});
