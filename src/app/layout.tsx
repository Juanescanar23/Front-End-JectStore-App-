import { Outfit } from "next/font/google";
import "./globals.css";
import {
  AppWrapper,
  ReduxProvider,
  ThemeProvider,
  ToastProvider,
  SessionProvider,
} from "@/providers";
import { generateMetadataForPage } from "@utils/helper";
import { staticSeo } from "@utils/metadata";
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";
import { SpeculationRules } from "@components/theme/SpeculationRules";
import clsx from "clsx";
import { headers } from "next/headers";
import PortalShell from "@/app/portal/PortalShell";
import { getRequestBaseUrl } from "@/utils/server/request-base-url";
import { getStorefrontSeoPayload } from "@/utils/server/storefront-seo";
import { getStorefrontLocaleCode } from "@/utils/server/storefront-locale";
import { PREVIEW_QUERY_HEADER } from "@/lib/storefront-experience/runtime";

const LANDLORD_HOST = "app.jectstore.com";

async function isLandlordHost() {
  const headerList = await headers();
  const host = headerList.get("host") ?? "";
  return host.replace(/:\d+$/, "") === LANDLORD_HOST;
}

export const outfit = Outfit({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
  variable: "--font-outfit",
  display: "optional",
  preload: true,
});

export async function generateMetadata() {
  const baseUrl = await getRequestBaseUrl();
  const landlord = await isLandlordHost();
  const runtimeHost = baseUrl ? new URL(baseUrl).host.replace(/:\d+$/, "") : "";
  const tenantHostTitle = runtimeHost || "JectStore";
  const tenantSeo = landlord ? null : await getStorefrontSeoPayload();

  return generateMetadataForPage("", {
    ...staticSeo.default,
    title: tenantSeo?.title || (landlord ? staticSeo.default.title : tenantHostTitle),
    description:
      tenantSeo?.description ||
      (landlord ? staticSeo.default.description : `Tienda online en ${tenantHostTitle}`),
    image: tenantSeo?.image || staticSeo.default.image,
    siteName: tenantSeo?.siteName || tenantSeo?.title || tenantHostTitle,
    baseUrl: baseUrl ?? undefined,
  });
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const landlord = await isLandlordHost();
  const storefrontLocale = await getStorefrontLocaleCode();
  const htmlLang = storefrontLocale || "es";
  // The proxy removes client-supplied internal headers and sets this marker
  // only for its scoped preview route; backend preview authorization remains.
  const readonlyPreview = (await headers()).has(PREVIEW_QUERY_HEADER);

  return (
    <html lang={htmlLang} suppressHydrationWarning>
        <head>
        {!readonlyPreview && <script
          type="speculationrules"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              prerender: [
                {
                  where: {
                    and: [
                      { href_matches: "/*" },
                      { not: { href_matches: "/logout" } },
                      { not: { href_matches: "/*\\?*(^|&)add-to-cart=*" } },
                      { not: { selector_matches: ".no-prerender" } },
                      { not: { selector_matches: "[rel~=nofollow]" } },
                    ],
                  },
                },
              ],
              prefetch: [
                {
                  urls: ["next.html", "next2.html"],
                  requires: ["anonymous-client-ip-when-cross-origin"],
                  referrer_policy: "no-referrer",
                },
              ],
            }),
          }}
        />}
      </head>
      <body  className={clsx(
          "min-h-screen font-outfit text-foreground bg-background antialiased",
          outfit.variable
        )}>
        <main>
        <ThemeProvider>
          <SessionProvider readonlyPreview={readonlyPreview}>
            <ToastProvider>
              <ReactQueryProvider>
                <ReduxProvider>
                  {landlord ? (
                    <PortalShell />
                  ) : (
                    <AppWrapper>{children}</AppWrapper>
                  )}
                </ReduxProvider>
              </ReactQueryProvider>
            </ToastProvider>
          </SessionProvider>
           {!readonlyPreview && <SpeculationRules />}
        </ThemeProvider>
        </main>
        <span className="dsv-2025.04.19-7e29"/>
      </body>
    </html>
  );
}
