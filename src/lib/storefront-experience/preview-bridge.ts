/** Authored editor protocol only. No document content is interpreted as code. */
export function installNextPreviewBridge(target: Window, sectionIds: string[]): () => void {
  if (target.parent === target) return () => {};
  const document = target.document;
  const root = document.getElementById("next-storefront-preview");
  const token = new URLSearchParams(target.location.search).get("_editor_preview");
  if (!root || !token || token.length > 512) return () => {};
  const allowed = new Set(["region-header", "region-footer", ...sectionIds]);
  const parentOrigin = new URL(target.location.href).origin;
  const notify = (payload: Record<string, string>) => target.parent.postMessage({ ...payload, previewToken: token }, parentOrigin);
  const ready = () => notify({ type: "jectstore:storefront-preview-ready" });
  const click = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const element = event.target as Element | null;
    const section = element?.closest?.("[data-storefront-section-id]") as HTMLElement | null;
    const id = section?.dataset.storefrontSectionId;
    if (section && root.contains(section) && id && allowed.has(id)) {
      notify({ type: "jectstore:storefront-section-selected", sectionId: id });
    }
  };
  const submit = (event: Event) => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); };
  document.addEventListener("click", click, true);
  document.addEventListener("submit", submit, true);
  target.addEventListener("load", ready, { once: true });
  ready();
  return () => {
    document.removeEventListener("click", click, true);
    document.removeEventListener("submit", submit, true);
    target.removeEventListener("load", ready);
  };
}
