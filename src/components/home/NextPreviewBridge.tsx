"use client";

import { useEffect } from "react";
import { installNextPreviewBridge } from "@/lib/storefront-experience/preview-bridge";

export default function NextPreviewBridge({ sectionIds }: { sectionIds: string[] }) {
  useEffect(() => installNextPreviewBridge(window, sectionIds), [sectionIds]);
  return null;
}
