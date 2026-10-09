import Link from "next/link";
import { GET_THEME_CUSTOMIZATION } from "@/graphql";
import { graphqlRequest } from "../../lib/graphql-fetch";
import RenderThemeCustomization from "@components/home/RenderThemeCustomization";
import { ThemeCustomizationResponse } from "@/types/theme/theme-customization";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function Home() {
  let themeCustomizations: ThemeCustomizationResponse["themeCustomization"] | undefined;

  try {
    const data = await graphqlRequest<ThemeCustomizationResponse>(
      GET_THEME_CUSTOMIZATION,
      undefined,
      {
        tags: ["home", "theme", "theme-customization"],
        life: "hours",
      }
    );

    themeCustomizations = data?.themeCustomization;
  } catch (error) {
    console.error("Unable to resolve home theme customization:", error);
  }

  if (!Array.isArray(themeCustomizations) || themeCustomizations.length === 0) {
    return (
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pb-24 lg:pt-16">
        <div className="rounded-[32px] border border-neutral-200 bg-white px-6 py-12 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:px-10 lg:px-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
            Tienda online
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">
            Compra sin fricción aunque la portada del tenant todavía no esté personalizada.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600 sm:text-base">
            Dejamos un fallback comercial estable para que la tienda siga
            navegable mientras se termina de ajustar el contenido de la home.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/search"
              className="inline-flex items-center justify-center rounded-full bg-neutral-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Ver catálogo
            </Link>
            <Link
              href="/customer/login"
              className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-6 py-3 text-sm font-semibold text-neutral-900 transition hover:border-neutral-900 hover:bg-neutral-50"
            >
              Ingresar
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <RenderThemeCustomization themeCustomizations={themeCustomizations} />
  );
}
