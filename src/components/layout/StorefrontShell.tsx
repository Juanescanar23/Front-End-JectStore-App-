import type { ReactNode } from "react";
import Footer from "./footer";
import Navbar from "./navbar";
import FloatingWhatsAppButton from "@/components/common/whatsapp/FloatingWhatsAppButton";
import { getTenantWhatsAppConfig } from "@/utils/server/tenant-whatsapp";
import type { NextStorefrontDocument } from "@/lib/storefront-experience/document";

export default async function StorefrontShell({ children, document }: { children: ReactNode; document?: NextStorefrontDocument | null }) {
  const tenantWhatsApp = await getTenantWhatsAppConfig();
  return (
    <main>
      <Navbar allowsCheckout={tenantWhatsApp?.allowsCheckout !== false} editorial={document?.regions.header.settings} />
      <div className="mx-auto min-h-[calc(100vh-580px)] w-full">{children}</div>
      <Footer editorial={document?.regions.footer.settings} branding={document?.regions.header.settings} />
      <FloatingWhatsAppButton href={tenantWhatsApp?.enabled ? tenantWhatsApp.waBaseUrl : null} />
    </main>
  );
}
