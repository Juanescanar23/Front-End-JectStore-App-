"use client";

import { CodTenantSettings } from "@/types/cod";
import { useCustomToast } from "@/utils/hooks/useToast";
import { useEffect, useMemo, useState } from "react";

const defaultSettings: CodTenantSettings = {
  plan_name: "emprendedor",
  active: false,
  title: "Pago contraentrega",
  description: "Paga cuando recibas tu pedido.",
  countries: ["CO", "MX", "AR"],
  min_total: null,
  max_total: null,
  allowed_shipping_methods: null,
  fee_type: "none",
  fee_value: null,
  require_email: false,
  require_whatsapp: true,
  modal_enabled: true,
  modal_cta_text: "COMPRA Y PAGA AL RECIBIR",
  modal_helper_text: "Completa tus datos de envío para confirmar tu pedido.",
};

export default function CodSettingsPanel() {
  const { showToast } = useCustomToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowedByPlan, setAllowedByPlan] = useState(true);
  const [settings, setSettings] = useState<CodTenantSettings>(defaultSettings);

  const countriesInput = useMemo(() => settings.countries.join(","), [settings.countries]);
  const shippingInput = useMemo(
    () => (settings.allowed_shipping_methods || []).join(","),
    [settings.allowed_shipping_methods],
  );

  const load = async () => {
    try {
      const response = await fetch("/api/portal/cod/settings", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        settings?: CodTenantSettings;
        allowed_by_plan?: boolean;
        error?: string;
      };

      if (payload.settings) {
        setSettings(payload.settings);
      }

      if (typeof payload.allowed_by_plan === "boolean") {
        setAllowedByPlan(payload.allowed_by_plan);
      } else {
        setAllowedByPlan(response.status !== 403);
      }

      if (!response.ok && payload.error) {
        showToast(payload.error, "warning");
      }
    } catch {
      showToast("No se pudo cargar configuración COD.", "warning");
      setAllowedByPlan(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Hydrate an editable settings draft from the external API after mount.
    // It cannot be computed from props, and the initial loading state is true.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const save = async () => {
    setSaving(true);

    try {
      const response = await fetch("/api/portal/cod/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(settings),
      });

      const payload = (await response.json()) as {
        settings?: CodTenantSettings;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo guardar configuración COD.");
      }

      if (payload.settings) {
        setSettings(payload.settings);
      }

      showToast("Configuración COD actualizada.", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "No se pudo guardar configuración COD.",
        "warning",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-neutral-500">Cargando configuración COD...</p>;
  }

  if (!allowedByPlan) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        El plan actual no tiene habilitada la feature <strong>cash_on_delivery</strong>.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Settings COD</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-neutral-700">
            Plan
            <select
              value={settings.plan_name}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, plan_name: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="basic">Basic</option>
              <option value="emprendedor">Emprendedor</option>
              <option value="mipyme">MiPyme</option>
            </select>
          </label>

          <label className="text-xs font-medium text-neutral-700">
            Activo
            <select
              value={settings.active ? "1" : "0"}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, active: event.target.value === "1" }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="0">No</option>
              <option value="1">Sí</option>
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-3">
          <label className="text-xs font-medium text-neutral-700">
            Título método
            <input
              value={settings.title}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, title: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs font-medium text-neutral-700">
            Descripción método
            <textarea
              value={settings.description}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, description: event.target.value }))
              }
              className="mt-1 min-h-[72px] w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-neutral-700">
            Países habilitados (CSV)
            <input
              value={countriesInput}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  countries: event.target.value
                    .split(",")
                    .map((item) => item.trim().toUpperCase())
                    .filter(Boolean),
                }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs font-medium text-neutral-700">
            Shipping permitido (CSV)
            <input
              value={shippingInput}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  allowed_shipping_methods: event.target.value.trim()
                    ? event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean)
                    : null,
                }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs font-medium text-neutral-700">
            Mínimo total
            <input
              type="number"
              value={settings.min_total ?? ""}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  min_total: event.target.value === "" ? null : Number(event.target.value),
                }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs font-medium text-neutral-700">
            Máximo total
            <input
              type="number"
              value={settings.max_total ?? ""}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  max_total: event.target.value === "" ? null : Number(event.target.value),
                }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-medium text-neutral-700">
            Fee tipo
            <select
              value={settings.fee_type}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  fee_type: event.target.value as CodTenantSettings["fee_type"],
                }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="none">none</option>
              <option value="fixed">fixed</option>
              <option value="percent">percent</option>
            </select>
          </label>

          <label className="text-xs font-medium text-neutral-700">
            Fee valor
            <input
              type="number"
              value={settings.fee_value ?? ""}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  fee_value: event.target.value === "" ? null : Number(event.target.value),
                }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs font-medium text-neutral-700">
            Modal habilitado
            <select
              value={settings.modal_enabled ? "1" : "0"}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  modal_enabled: event.target.value === "1",
                }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="1">Sí</option>
              <option value="0">No</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-neutral-700">
            Require email
            <select
              value={settings.require_email ? "1" : "0"}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, require_email: event.target.value === "1" }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="0">No</option>
              <option value="1">Sí</option>
            </select>
          </label>

          <label className="text-xs font-medium text-neutral-700">
            Require WhatsApp
            <select
              value={settings.require_whatsapp ? "1" : "0"}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  require_whatsapp: event.target.value === "1",
                }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="0">No</option>
              <option value="1">Sí</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="text-xs font-medium text-neutral-700">
            Texto CTA modal
            <input
              value={settings.modal_cta_text}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  modal_cta_text: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs font-medium text-neutral-700">
            Texto helper modal
            <textarea
              value={settings.modal_helper_text}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  modal_helper_text: event.target.value,
                }))
              }
              className="mt-1 min-h-[72px] w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar configuración"}
          </button>
        </div>
      </section>

      <aside className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="text-base font-semibold">Vista previa CTA</h3>
        <div className="mt-4 rounded-xl border border-neutral-200 p-4">
          <p className="text-sm font-semibold text-neutral-800">{settings.modal_cta_text}</p>
          <p className="mt-2 text-xs text-neutral-500">{settings.modal_helper_text}</p>
          <div className="mt-4 rounded-full border border-blue-500 px-3 py-2 text-center text-xs font-semibold text-blue-700">
            {settings.title}
          </div>
        </div>
      </aside>
    </div>
  );
}
