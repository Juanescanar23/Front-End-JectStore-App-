"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { reportStorefrontVisit, type StorefrontVisitDetails } from "@/utils/storefront-visit";

/** Mounted by successful page renderers, never by server queries or prefetch. */
export default function StorefrontVisit({ pageType, pageId, term, results }: StorefrontVisitDetails) {
  const pathname = usePathname();
  useEffect(() => {
    const doc = document as Document & { prerendering?: boolean };
    const send = () => {
      if (doc.prerendering || doc.visibilityState !== "visible") return;
      reportStorefrontVisit({ pageType, pageId, term, results }, window.location.href, doc.referrer);
    };
    send();
    doc.addEventListener("prerenderingchange", send);
    doc.addEventListener("visibilitychange", send);
    return () => {
      doc.removeEventListener("prerenderingchange", send);
      doc.removeEventListener("visibilitychange", send);
    };
  }, [pathname, pageType, pageId, term, results]);
  return null;
}
