/** The Next base has its own capabilities; Visual documents never enter React. */
export type NextImage = { image: string; imageUrl?: string; link: string; title: string };
export type NextHeaderSettings = {
  brand_name: string;
  logo_url: string | null;
  menu_links: Array<{ label: string; url: string }>;
};
export type NextFooterLink = { title: string; url: string; sortOrder?: number };
export type NextFooterSettings = {
  columns: { column_1: NextFooterLink[]; column_2: NextFooterLink[]; column_3: NextFooterLink[] };
  services: Array<{ title: string; description: string; serviceIcon: string }>;
  newsletter: { title: string; text: string; button_label: string };
  copyright_text: string;
};
type Section<T extends string, S> = { id: string; type: T; visible: boolean; settings: S };
export type NextStoreIntroSettings = {
  eyebrow: string;
  heading: string;
  body: string;
  primary_label: string;
  primary_url: string;
  secondary_label: string;
  secondary_url: string;
};
export type NextStoreIntroSection = Section<"store_intro", NextStoreIntroSettings>;
export type NextImageSection = Section<"image_carousel", { images: NextImage[] }>;
export type NextProductSection = Section<"product_carousel", {
  title: string;
  description: string;
  filters: Record<string, string | number | null>;
  layout: "three-item" | "grid";
}>;
export type NextCategorySection = Section<"category_carousel", {
  title: string;
  description: string;
  category_ids: number[];
}>;
export type NextStorefrontDocument = {
  schema_version: 1;
  template: "next-current";
  regions: {
    header: Section<"header", NextHeaderSettings>;
    footer: Section<"footer", NextFooterSettings>;
  };
  sections: Array<NextStoreIntroSection | NextImageSection | NextProductSection | NextCategorySection>;
};

const invalid = (field: string): never => { throw new Error(`Invalid Next storefront document: ${field}`); };
const record = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(field);
  return value as Record<string, unknown>;
};
const keys = (value: Record<string, unknown>, allowed: string[], field: string) => {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid(field);
};
const text = (value: unknown, field: string, max = 300): string => {
  // Match PHP mb_strlen(..., 'UTF-8'): limits count Unicode code points, not UTF-16 units.
  if (typeof value !== "string" || Array.from(value).length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return invalid(field);
  return value;
};
const list = (value: unknown, field: string, max: number): unknown[] => {
  if (!Array.isArray(value) || value.length > max) return invalid(field);
  return value;
};

/** Explicit local destinations are preserved, never reduced to their final slug. */
export function isLocalStorefrontUrl(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//")
    && !/[\\\s\u0000-\u001f]/.test(value)
    && !/%(?:0[ad]|5c)/i.test(value);
}

export function nextBannerHref(link: string): string {
  if (isLocalStorefrontUrl(link)) return link;
  if (link && /^[\p{L}\p{N}_~.%/-]+$/u.test(link) && !link.startsWith("/") && !link.includes("..") && !/%(?:0[ad]|5c|2f)/i.test(link)) return `/search/${link}`;
  return "";
}

function imageUrl(value: unknown, field: string): string {
  const url = text(value, field, 2048);
  if (!url) return url;
  if (isLocalStorefrontUrl(url)) return url;
  if (/^[\p{L}\p{N}_~.%/-]+$/u.test(url) && !url.startsWith("/") && !url.includes("..") && !url.includes(":")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password && !/[\\\s]/.test(url)) return url;
  } catch { /* A rejected image never becomes executable markup. */ }
  return invalid(field);
}

function localLink(value: unknown, field: string): string {
  const url = text(value, field, 2048);
  if (!isLocalStorefrontUrl(url)) return invalid(field);
  return url;
}

function validateFilters(value: unknown): Record<string, string | number | null> {
  const filters = record(value, "product.filters");
  keys(filters, ["featured", "new", "category_id", "sort", "order", "limit"], "product.filters");
  for (const [key, raw] of Object.entries(filters)) {
    if (raw === "" || raw === null) continue;
    if (typeof raw !== "string" && typeof raw !== "number") invalid(`product.filters.${key}`);
    const item = String(raw);
    if (["featured", "new"].includes(key) && !["0", "1"].includes(item)) invalid(key);
    if (key === "category_id" && (!/^[1-9]\d*$/.test(item) || !Number.isSafeInteger(Number(item)))) invalid(key);
    if (key === "limit" && (!/^[1-8]$/.test(item))) invalid(key);
    if (key === "sort" && !["name", "price", "created_at", "name-asc", "name-desc", "price-asc", "price-desc", "newest", "oldest"].includes(item)) invalid(key);
    if (key === "order" && !["asc", "desc"].includes(item)) invalid(key);
  }
  return filters as Record<string, string | number | null>;
}

export function parseNextStorefrontDocument(value: unknown): NextStorefrontDocument {
  const document = record(value, "document");
  keys(document, ["schema_version", "template", "regions", "sections"], "document");
  if (document.schema_version !== 1 || document.template !== "next-current") invalid("schema/template");
  const regions = record(document.regions, "regions");
  keys(regions, ["header", "footer"], "regions");
  const seen = new Set(["region-header", "region-footer"]);

  for (const name of ["header", "footer"] as const) {
    const region = record(regions[name], name);
    keys(region, ["id", "type", "visible", "settings"], name);
    if (region.id !== `region-${name}` || region.type !== name || region.visible !== true) invalid(name);
    const settings = record(region.settings, `${name}.settings`);
    if (name === "header") {
      keys(settings, ["brand_name", "logo_url", "menu_links"], name);
      text(settings.brand_name, "brand_name", 80);
      if (settings.logo_url !== null) imageUrl(settings.logo_url, "logo_url");
      for (const entry of list(settings.menu_links, "menu_links", 6)) {
        const link = record(entry, "menu_link");
        keys(link, ["label", "url"], "menu_link");
        text(link.label, "menu.label", 120);
        localLink(link.url, "menu.url");
      }
    } else {
      keys(settings, ["columns", "services", "newsletter", "copyright_text"], name);
      const columns = record(settings.columns, "columns");
      keys(columns, ["column_1", "column_2", "column_3"], "columns");
      for (const column of ["column_1", "column_2", "column_3"]) {
        for (const entry of list(columns[column], column, 12)) {
          const link = record(entry, column);
          keys(link, ["title", "url", "sortOrder"], column);
          text(link.title, "footer.title", 120);
          localLink(link.url, "footer.url");
          if (link.sortOrder !== undefined && (!Number.isSafeInteger(link.sortOrder) || Number(link.sortOrder) < 0)) invalid("footer.sortOrder");
        }
      }
      for (const entry of list(settings.services, "services", 8)) {
        const service = record(entry, "service");
        keys(service, ["title", "description", "serviceIcon"], "service");
        text(service.title, "service.title", 120);
        text(service.description, "service.description", 300);
        if (!["", "icon-truck", "icon-product", "icon-dollar-sign", "icon-support"].includes(String(service.serviceIcon))) invalid("serviceIcon");
      }
      const newsletter = record(settings.newsletter, "newsletter");
      keys(newsletter, ["title", "text", "button_label"], "newsletter");
      text(newsletter.title, "newsletter.title", 120);
      text(newsletter.text, "newsletter.text", 300);
      text(newsletter.button_label, "newsletter.button_label", 60);
      text(settings.copyright_text, "copyright_text", 300);
    }
  }

  for (const entry of list(document.sections, "sections", 30)) {
    const section = record(entry, "section");
    keys(section, ["id", "type", "visible", "settings"], "section");
    const id = text(section.id, "section.id", 64);
    if (!/^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/.test(id) || seen.has(id) || typeof section.visible !== "boolean") invalid("section.identity");
    seen.add(id);
    const settings = record(section.settings, "section.settings");
    if (section.type === "store_intro") {
      keys(settings, ["eyebrow", "heading", "body", "primary_label", "primary_url", "secondary_label", "secondary_url"], "intro.settings");
      for (const [field, max] of [["eyebrow", 80], ["heading", 240], ["body", 600], ["primary_label", 80], ["secondary_label", 80]] as const) {
        const value = text(settings[field], `intro.${field}`, max);
        if (["heading", "primary_label", "secondary_label"].includes(field) && !value.replace(/[\s\u0085]/gu, "")) invalid(`intro.${field}`);
        if (/[<>]/.test(value)) invalid(`intro.${field}`);
      }
      for (const field of ["primary_url", "secondary_url"]) {
        const url = localLink(settings[field], `intro.${field}`);
        let decoded = url;
        // Match rawurldecode for the safety checks, including literal percent,
        // percent-encoded spaces and arbitrary bytes. Keep the original URL.
        for (let i = 0; i < 3; i++) decoded = decoded.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
        if (decoded.startsWith("//") || /[<>\\\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(decoded)) invalid(`intro.${field}`);
      }
    } else if (section.type === "image_carousel") {
      keys(settings, ["images"], "image.settings");
      for (const entry of list(settings.images, "images", 20)) {
        const image = record(entry, "image");
        keys(image, ["image", "imageUrl", "link", "title"], "image");
        imageUrl(image.image, "image.image");
        if (image.imageUrl !== undefined) imageUrl(image.imageUrl, "image.imageUrl");
        text(image.title, "image.title", 300);
        const link = text(image.link, "image.link", 2048);
        if (link && !nextBannerHref(link)) invalid("image.link");
      }
    } else if (section.type === "product_carousel") {
      keys(settings, ["title", "description", "filters", "layout"], "product.settings");
      text(settings.title, "product.title", 120);
      text(settings.description, "product.description", 600);
      validateFilters(settings.filters);
      if (!["three-item", "grid"].includes(String(settings.layout))) invalid("product.layout");
    } else if (section.type === "category_carousel") {
      keys(settings, ["title", "description", "category_ids"], "category.settings");
      text(settings.title, "category.title", 120);
      text(settings.description, "category.description", 600);
      const ids = list(settings.category_ids, "category_ids", 3);
      if (new Set(ids).size !== ids.length || ids.some((id) => !Number.isSafeInteger(id) || Number(id) < 1)) invalid("category_ids");
    } else invalid("section.type");
  }
  return document as NextStorefrontDocument;
}
