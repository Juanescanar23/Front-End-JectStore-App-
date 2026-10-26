import { ReactNode } from "react";
import StorefrontShell from "@/components/layout/StorefrontShell";
import { getStorefrontExperience } from "@/lib/storefront-experience/server";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const experience = await getStorefrontExperience();
  return (
    <StorefrontShell document={experience?.document}>{children}</StorefrontShell>
  );
}
