import { ReactNode } from "react";
import Footer from "@/components/layout/footer";
import Navbar from "@/components/layout/navbar";
import FloatingWhatsAppButton from "@/components/common/whatsapp/FloatingWhatsAppButton";
import { getTenantWhatsAppConfig } from "@/utils/server/tenant-whatsapp";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const tenantWhatsApp = await getTenantWhatsAppConfig();

  return (
    <main>
      <Navbar />
      <div className="mx-auto min-h-[calc(100vh-580px)] w-full">
        {children}
      </div>
      <Footer />
      <FloatingWhatsAppButton href={tenantWhatsApp?.enabled ? tenantWhatsApp.waBaseUrl : null} />
    </main>
  );
}
