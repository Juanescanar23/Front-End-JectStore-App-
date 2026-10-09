"use client";

import { CodOffer, CodProductSnapshot } from "@/types/cod";
import { useCustomToast } from "@/utils/hooks/useToast";
import { Price } from "@/components/theme/ui/Price";
import { useMemo, useState } from "react";

interface OfferFormState {
  status: boolean;
  product_id: number;
  title: string;
  subtitle: string;
  badge_text: string;
  price: number;
  compare_at_price: number | null;
  units_count: number;
  selection_strategy: CodOffer["selection_strategy"];
  required_attributes: string[];
  sort_order: number;
}

const emptyForm: OfferFormState = {
  status: true,
  product_id: 0,
  title: "",
  subtitle: "",
  badge_text: "",
  price: 0,
  compare_at_price: null,
  units_count: 1,
  selection_strategy: "none",
  required_attributes: [],
  sort_order: 0,
};

export default function CodOffersPanel() {
  const { showToast } = useCustomToast();
  const [productIdInput, setProductIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<CodProductSnapshot | null>(null);
  const [offers, setOffers] = useState<CodOffer[]>([]);
  const [form, setForm] = useState<OfferFormState>(emptyForm);
  const [editingOfferId, setEditingOfferId] = useState<number | null>(null);

  const currencyCode = selectedProduct?.currency_code || "USD";

  const availableAttributes = useMemo(
    () => selectedProduct?.attributes || [],
    [selectedProduct],
  );

  const selectedOfferForPreview = useMemo(() => {
    if (!editingOfferId) return null;
    return offers.find((offer) => offer.id === editingOfferId) || null;
  }, [editingOfferId, offers]);

  const loadOffers = async (productId: number) => {
    const response = await fetch(
      `/api/portal/sales/cod-offers?product_id=${encodeURIComponent(String(productId))}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );

    const payload = (await response.json()) as {
      offers?: CodOffer[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "No se pudieron cargar ofertas COD.");
    }

    setOffers(Array.isArray(payload.offers) ? payload.offers : []);
  };

  const loadProduct = async () => {
    const parsed = Number(productIdInput);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      showToast("Ingresa un product_id válido.", "warning");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `/api/checkout/cod/config?product_id=${encodeURIComponent(String(parsed))}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        },
      );

      const payload = (await response.json()) as {
        product_snapshot?: CodProductSnapshot | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo cargar snapshot del producto.");
      }

      if (!payload.product_snapshot) {
        throw new Error("No se encontró snapshot de producto para este ID.");
      }

      const snapshot = payload.product_snapshot;

      setSelectedProduct(snapshot);
      setForm((prev) => ({
        ...prev,
        product_id: snapshot.id || parsed,
        required_attributes: snapshot.attributes.map((attr) => attr.code),
      }));

      await loadOffers(parsed);
      setEditingOfferId(null);
      showToast("Producto cargado. Ya puedes administrar ofertas COD.", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "No se pudo cargar producto COD.",
        "warning",
      );
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm((prev) => ({
      ...emptyForm,
      product_id: prev.product_id,
      required_attributes: selectedProduct?.attributes.map((attr) => attr.code) || [],
    }));
    setEditingOfferId(null);
  };

  const saveOffer = async () => {
    if (!selectedProduct) {
      showToast("Carga primero un producto para administrar ofertas.", "warning");
      return;
    }

    if (!form.title.trim()) {
      showToast("El título es obligatorio.", "warning");
      return;
    }

    if (!Number.isFinite(form.price) || form.price <= 0) {
      showToast("El precio debe ser mayor a 0.", "warning");
      return;
    }

    if (!Number.isFinite(form.units_count) || form.units_count <= 0) {
      showToast("units_count debe ser mayor a 0.", "warning");
      return;
    }

    setSaving(true);

    try {
      const body = {
        ...form,
        product_id: selectedProduct.id,
        subtitle: form.subtitle || null,
        badge_text: form.badge_text || null,
        compare_at_price: form.compare_at_price,
      };

      const url = editingOfferId
        ? `/api/portal/sales/cod-offers/${editingOfferId}`
        : "/api/portal/sales/cod-offers";
      const method = editingOfferId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as {
        offer?: CodOffer;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo guardar la oferta COD.");
      }

      await loadOffers(selectedProduct.id);
      resetForm();

      showToast("Oferta COD guardada.", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "No se pudo guardar oferta COD.",
        "warning",
      );
    } finally {
      setSaving(false);
    }
  };

  const editOffer = (offer: CodOffer) => {
    setEditingOfferId(offer.id);
    setForm({
      status: offer.status,
      product_id: offer.product_id,
      title: offer.title,
      subtitle: offer.subtitle || "",
      badge_text: offer.badge_text || "",
      price: offer.price,
      compare_at_price: offer.compare_at_price ?? null,
      units_count: offer.units_count,
      selection_strategy: offer.selection_strategy,
      required_attributes: offer.required_attributes || [],
      sort_order: offer.sort_order,
    });
  };

  const removeOffer = async (offerId: number) => {
    if (!selectedProduct) return;

    setSaving(true);

    try {
      const response = await fetch(`/api/portal/sales/cod-offers/${offerId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo eliminar la oferta.");
      }

      await loadOffers(selectedProduct.id);
      if (editingOfferId === offerId) {
        resetForm();
      }

      showToast("Oferta eliminada.", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "No se pudo eliminar la oferta.",
        "warning",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Ofertas COD</h2>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="number"
            value={productIdInput}
            onChange={(event) => setProductIdInput(event.target.value)}
            placeholder="product_id"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={loadProduct}
            disabled={loading}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Cargando..." : "Cargar producto"}
          </button>
        </div>

        {selectedProduct ? (
          <div className="mt-3 rounded-lg border border-neutral-200 p-3 text-sm">
            <p className="font-semibold">{selectedProduct.title}</p>
            <p className="text-neutral-500">product_id: {selectedProduct.id}</p>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3">
          <label className="text-xs font-medium text-neutral-700">
            Estado
            <select
              value={form.status ? "1" : "0"}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, status: event.target.value === "1" }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="1">Activo</option>
              <option value="0">Inactivo</option>
            </select>
          </label>

          <label className="text-xs font-medium text-neutral-700">
            Título
            <input
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs font-medium text-neutral-700">
            Subtítulo (opcional)
            <input
              value={form.subtitle}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, subtitle: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs font-medium text-neutral-700">
            Badge text (opcional)
            <input
              value={form.badge_text}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, badge_text: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs font-medium text-neutral-700">
              Precio
              <input
                type="number"
                value={form.price}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, price: Number(event.target.value) }))
                }
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-xs font-medium text-neutral-700">
              Compare at
              <input
                type="number"
                value={form.compare_at_price ?? ""}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    compare_at_price:
                      event.target.value === "" ? null : Number(event.target.value),
                  }))
                }
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-xs font-medium text-neutral-700">
              Units count
              <input
                type="number"
                value={form.units_count}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    units_count: Math.max(1, Number(event.target.value || 1)),
                  }))
                }
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-neutral-700">
              Selection strategy
              <select
                value={form.selection_strategy}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    selection_strategy: event.target.value as OfferFormState["selection_strategy"],
                  }))
                }
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="none">none</option>
                <option value="single_variant_for_all">single_variant_for_all</option>
                <option value="per_unit_variant">per_unit_variant</option>
              </select>
            </label>

            <label className="text-xs font-medium text-neutral-700">
              Sort order
              <input
                type="number"
                value={form.sort_order}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sort_order: Number(event.target.value || 0) }))
                }
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div>
            <p className="text-xs font-medium text-neutral-700">required_attributes</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {availableAttributes.length === 0 ? (
                <p className="text-xs text-neutral-500">Carga un producto para obtener atributos reales.</p>
              ) : (
                availableAttributes.map((attribute) => (
                  <label
                    key={attribute.code}
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={form.required_attributes.includes(attribute.code)}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          required_attributes: event.target.checked
                            ? Array.from(new Set([...prev.required_attributes, attribute.code]))
                            : prev.required_attributes.filter((code) => code !== attribute.code),
                        }))
                      }
                    />
                    <span>{attribute.label}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {editingOfferId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium"
            >
              Cancelar edición
            </button>
          ) : null}

          <button
            type="button"
            onClick={saveOffer}
            disabled={saving || !selectedProduct}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Guardando..." : editingOfferId ? "Actualizar oferta" : "Crear oferta"}
          </button>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h3 className="text-base font-semibold">Vista previa card</h3>
          <div className="mt-3 rounded-xl border border-neutral-200 p-3">
            <p className="text-sm font-semibold">{form.title || "Título oferta"}</p>
            {form.subtitle ? <p className="mt-1 text-xs text-neutral-500">{form.subtitle}</p> : null}
            {form.badge_text ? (
              <span className="mt-2 inline-block rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold uppercase text-white">
                {form.badge_text}
              </span>
            ) : null}
            <div className="mt-2 flex items-center gap-2 text-sm">
              <Price amount={String(form.price || 0)} currencyCode={currencyCode} className="font-semibold" />
              {form.compare_at_price ? (
                <Price
                  amount={String(form.compare_at_price)}
                  currencyCode={currencyCode}
                  className="text-xs text-neutral-500 line-through"
                />
              ) : null}
            </div>
            <p className="mt-1 text-xs text-neutral-600">{form.units_count} unidades</p>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h3 className="text-base font-semibold">Ofertas existentes</h3>
          <div className="mt-3 space-y-2">
            {offers.length === 0 ? (
              <p className="text-xs text-neutral-500">No hay ofertas para este producto.</p>
            ) : (
              offers.map((offer) => (
                <div key={offer.id} className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{offer.title}</p>
                      <p className="text-xs text-neutral-500">ID #{offer.id}</p>
                      <p className="text-xs text-neutral-600">
                        strategy: {offer.selection_strategy}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        offer.status
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-neutral-200 text-neutral-700"
                      }`}
                    >
                      {offer.status ? "activo" : "inactivo"}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <Price amount={String(offer.price)} currencyCode={currencyCode} className="font-semibold" />
                    <span className="text-neutral-500">{offer.units_count} unidades</span>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => editOffer(offer)}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => removeOffer(offer.id)}
                      className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {selectedOfferForPreview ? (
            <p className="mt-2 text-[11px] text-neutral-500">
              Editando oferta ID #{selectedOfferForPreview.id}
            </p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
