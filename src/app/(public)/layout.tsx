import { ReactNode } from "react";
import StorefrontShell from "@/components/layout/StorefrontShell";
import { getStorefrontExperience } from "@/lib/storefront-experience/server";
import { getStorefrontSeoPayload } from "@/utils/server/storefront-seo";
import { StorefrontErrorNameProvider } from "./error-context";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const experience = await getStorefrontExperience();
  const branding = await getStorefrontSeoPayload();
  return (
    <StorefrontShell document={experience?.document}>
      <StorefrontErrorNameProvider name={branding?.siteName ?? null}>
        {children}
      </StorefrontErrorNameProvider>
    </StorefrontShell>
  );
}
