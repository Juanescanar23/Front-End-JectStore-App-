// Synthetic local-only content; never fetched from a production tenant.
export function nextDocument() {
  return {
    schema_version: 1, template: "next-current",
    regions: {
      header: { id: "region-header", type: "header", visible: true, settings: {
        brand_name: "Tienda de prueba México 🎁", logo_url: "/fixture-logo.svg",
        menu_links: [{ label: "Categoría larga de prueba", url: "/search/fixture?sort=newest" }],
      } },
      footer: { id: "region-footer", type: "footer", visible: true, settings: {
        columns: { column_1: [{ title: "Ayuda de prueba", url: "/help/shipping?locale=es" }], column_2: [], column_3: [] },
        services: [{ title: "Envío", description: "Beneficio de prueba", serviceIcon: "icon-truck" }],
        newsletter: { title: "Boletín de prueba", text: "Contenido de prueba", button_label: "Suscribirme" },
        copyright_text: "Prueba editorial — ",
      } },
    },
    sections: [
      { id: "banner-1", type: "image_carousel", visible: true, settings: { images: [{ image: "/fixture-banner.svg", link: "/search?q=prueba", title: "Banner de prueba" }] } },
      { id: "products-1", type: "product_carousel", visible: true, settings: { title: "Productos editoriales", description: "Descripción editorial", layout: "three-item", filters: { featured: "1", limit: 3 } } },
      { id: "categories-1", type: "category_carousel", visible: true, settings: { title: "Categorías editoriales", description: "Descripción de categorías", category_ids: [3, 2] } },
    ],
  };
}

export function experience(overrides = {}) {
  return { data: {
    schema_version: 1, engine: "next", base_key: "next-current", channel: { id: 1, code: "default" },
    locale: "es", currency: "MXN", version: 1, published_revision_id: 11, document: nextDocument(), ...overrides,
  } };
}
