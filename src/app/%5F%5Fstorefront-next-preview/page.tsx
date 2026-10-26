import type { Metadata } from "next";
import StorefrontShell from "@/components/layout/StorefrontShell";
import RenderStorefrontDocument from "@/components/home/RenderStorefrontDocument";
import { getNextPreviewExperience } from "@/lib/storefront-experience/server";
import { StorefrontExperienceError } from "@/lib/storefront-experience/runtime";
import NextPreviewBridge from "@/components/home/NextPreviewBridge";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function NextStorefrontPreview() {
  const experience = await getNextPreviewExperience();
  const document = experience.document;
  if (!document) throw new StorefrontExperienceError("preview-document");
  // The loader requires an authorized Next document; no legacy/Visual fallback.
  return (
    <div id="next-storefront-preview" className="contents">
      <StorefrontShell document={document}>
        <RenderStorefrontDocument document={document} currency={experience.currency} />
      </StorefrontShell>
      <NextPreviewBridge sectionIds={document.sections.map((section) => section.id)} />
    </div>
  );
}
