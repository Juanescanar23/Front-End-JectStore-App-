/** Authored editor protocol only. No document content is interpreted as code. */
export function installNextPreviewBridge(target: Window, sectionIds: string[]): () => void {
  if (target.parent === target) return () => {};
  const document = target.document;
  const root = document.getElementById("next-storefront-preview");
  const token = new URLSearchParams(target.location.search).get("_editor_preview");
  if (!root || !token || token.length > 512) return () => {};
  const allowed = new Set(["region-header", "region-footer", ...sectionIds]);
  const parentOrigin = new URL(target.location.href).origin;
  const notify = (payload: Record<string, unknown>) => target.parent.postMessage({ ...payload, previewToken: token }, parentOrigin);
  let selected: HTMLElement | null = null;
  let inspection = true;
  let hovered: HTMLElement | null = null;
  let lastHoverId: string | null = null;
  let pendingSelection: 'selected' | 'position' | null = null;
  let pendingHover = false;
  let frame: number | null = null;
  let disposed = false;
  const sectionOf = (element: Element | null) => {
    const section = element?.closest?.('[data-storefront-section-id]') as HTMLElement | null;
    return section && root.contains(section) && allowed.has(section.dataset.storefrontSectionId ?? '') ? section : null;
  };
  const rectangle = (section: HTMLElement) => {
    // Sections may use display:contents. Measure their actual children instead
    // of returning an empty wrapper rectangle to the native inspector.
    const own = section.getBoundingClientRect?.();
    if (!own) return undefined;
    const rectangles = own.width || own.height ? [own] : Array.from(section.children).map(child => child.getBoundingClientRect()).filter(rect => rect.width || rect.height);
    if (!rectangles.length) return undefined;
    const left = Math.min(...rectangles.map(rect => rect.left)); const top = Math.min(...rectangles.map(rect => rect.top));
    const right = Math.max(...rectangles.map(rect => rect.right)); const bottom = Math.max(...rectangles.map(rect => rect.bottom));
    return { x: left, y: top, left, top, right, bottom, width: right - left, height: bottom - top };
  };
  const schedule = () => {
    if (frame !== null || disposed) return;
    frame = target.requestAnimationFrame(() => {
      frame = null;
      if (disposed) return;
      const measured = new Map<HTMLElement, ReturnType<typeof rectangle>>();
      const measure = (section: HTMLElement) => {
        if (!measured.has(section)) measured.set(section, rectangle(section));
        return measured.get(section);
      };
      if (pendingSelection && inspection && selected && sectionOf(selected)) {
        notify({ type: `jectstore:storefront-section-${pendingSelection}`, sectionId: selected.dataset.storefrontSectionId, rect: measure(selected) });
      }
      pendingSelection = null;
      if (pendingHover) {
        pendingHover = false;
        const current = inspection && hovered && sectionOf(hovered) ? hovered : null;
        const id = current?.dataset.storefrontSectionId ?? null;
        if (id !== lastHoverId) {
          lastHoverId = id;
          notify(current ? { type: 'jectstore:storefront-section-hover', sectionId: id, rect: measure(current) }
            : { type: 'jectstore:storefront-section-leave' });
        }
      }
    });
  };
  const position = () => {
    if (selected && inspection) { pendingSelection ??= 'position'; schedule(); }
  };
  const ready = () => notify({ type: "jectstore:storefront-preview-ready" });
  const click = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const element = event.target as Element | null;
    const section = sectionOf(element);
    const id = section?.dataset.storefrontSectionId;
    if (inspection && section && root.contains(section) && id && allowed.has(id)) {
      selected = section;
      pendingSelection = 'selected'; schedule();
    }
  };
  const submit = (event: Event) => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); };
  const hover = (event: Event) => {
    if (!inspection) return;
    const section = sectionOf(event.target as Element | null);
    if (section === hovered) return;
    hovered = section; pendingHover = true; schedule();
  };
  const receive = (event: MessageEvent) => {
    if (event.source !== target.parent || event.origin !== parentOrigin || event.data?.previewToken !== token || event.data?.type !== 'jectstore:next-inspector') return;
    switch (event.data.action) {
      case 'craftile.inspector.enable': inspection = true; position(); break;
      case 'craftile.inspector.disable': inspection = false; pendingSelection = null; hovered = null; pendingHover = true; schedule(); break;
      case 'craftile.editor.deselect-block': selected = null; pendingSelection = null; break;
      case 'craftile.editor.select-block': {
        const id = event.data.blockId;
        if (typeof id !== 'string' || !allowed.has(id)) return;
        selected = Array.from(root.querySelectorAll<HTMLElement>('[data-storefront-section-id]')).find(element => element.dataset.storefrontSectionId === id) ?? null;
        position(); break;
      }
    }
  };
  document.addEventListener("click", click, true);
  document.addEventListener("submit", submit, true);
  document.addEventListener('pointerover', hover, true);
  target.addEventListener('message', receive);
  target.addEventListener('scroll', position, { passive: true });
  target.addEventListener('resize', position);
  target.addEventListener("load", ready, { once: true });
  ready();
  return () => {
    disposed = true;
    if (frame !== null) target.cancelAnimationFrame(frame);
    frame = null;
    document.removeEventListener("click", click, true);
    document.removeEventListener("submit", submit, true);
    document.removeEventListener('pointerover', hover, true);
    target.removeEventListener('message', receive);
    target.removeEventListener('scroll', position);
    target.removeEventListener('resize', position);
    target.removeEventListener("load", ready);
  };
}
