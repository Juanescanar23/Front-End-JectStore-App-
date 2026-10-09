"use client";

import { useCustomToast } from "@/utils/hooks/useToast";
import { NOT_IMAGE, ORDER_ID } from "@/utils/constants";
import {
  CodCheckoutConfigResponse,
  CodOffer,
  CodOrderRequestBody,
} from "@/types/cod";
import { Price } from "@/components/theme/ui/Price";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { setCookie } from "@/utils/helper";
import { useRouter, useSearchParams } from "next/navigation";
import { NextImage } from "@/components/common/NextImage";

interface CodQuickCheckoutProps {
  productId: number;
}

type Step = 1 | 2 | 3;

const parseNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseSelectionsFromSearch = (
  codes: string[],
  searchParams: URLSearchParams,
): Record<string, number> =>
  codes.reduce<Record<string, number>>((acc, code) => {
    const parsed = Number(searchParams.get(code));
    if (Number.isFinite(parsed)) {
      acc[code] = parsed;
    }
    return acc;
  }, {});

const hasCompleteSelection = (
  selected: Record<string, number>,
  requiredCodes: string[],
) => requiredCodes.every((code) => Number.isFinite(selected[code]));

const variantExists = (
  variantIndex: Record<string, Record<string, number>>,
  selected: Record<string, number>,
) =>
  Object.values(variantIndex).some((candidate) =>
    Object.entries(selected).every(([code, optionId]) => candidate[code] === optionId),
  );

const getRequiredCodesForOffer = (
  offer: CodOffer,
  fallback: string[],
): string[] =>
  Array.isArray(offer.required_attributes) && offer.required_attributes.length > 0
    ? offer.required_attributes
    : fallback;

const currency = (config?: CodCheckoutConfigResponse | null) =>
  config?.product_snapshot?.currency_code || "USD";

const defaultForm = {
  name: "",
  whatsapp: "",
  country_code: "",
  region_id: "",
  city_id: "",
  address1: "",
  address2: "",
  email: "",
};

export default function CodQuickCheckout({ productId }: CodQuickCheckoutProps) {
  const [config, setConfig] = useState<CodCheckoutConfigResponse | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [selectedOfferId, setSelectedOfferId] = useState<number | null>(null);
  const [singleSelection, setSingleSelection] = useState<Record<string, number>>({});
  const [offerSharedSelection, setOfferSharedSelection] = useState<Record<string, number>>({});
  const [offerPerUnitSelections, setOfferPerUnitSelections] = useState<
    Array<Record<string, number>>
  >([]);
  const [form, setForm] = useState(defaultForm);
  const [countries, setCountries] = useState<Array<{ code: string; name: string }>>([]);
  const [regions, setRegions] = useState<Array<{ id: string; name: string }>>([]);
  const [cities, setCities] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedShippingCode, setSelectedShippingCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useCustomToast();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const productSnapshot = config?.product_snapshot || null;
  const productAttributeCodes = useMemo(
    () => (productSnapshot?.attributes || []).map((attr) => attr.code),
    [productSnapshot],
  );

  const offers = useMemo(
    () => (Array.isArray(config?.offers) ? config?.offers.filter((offer) => offer.status) : []),
    [config],
  );

  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.id === selectedOfferId) || null,
    [offers, selectedOfferId],
  );
  const [previousOffer, setPreviousOffer] = useState<CodOffer | null>(null);

  // Adjust this editable draft before rendering its fields, only when the
  // selected offer changes. Equal-size offers retain the existing selections.
  if (previousOffer !== selectedOffer) {
    setPreviousOffer(selectedOffer);
    setOfferPerUnitSelections((prev) => {
      if (!selectedOffer || selectedOffer.selection_strategy !== "per_unit_variant") {
        return [];
      }

      if (prev.length === selectedOffer.units_count) {
        return prev;
      }

      return Array.from({ length: selectedOffer.units_count }, (_, index) => prev[index] || {});
    });
  }

  const isOfferMode = Boolean(selectedOffer);

  const availableShippingMethods = useMemo(() => {
    if (!Array.isArray(config?.shipping_methods)) return [];

    return config.shipping_methods.filter((method) => {
      if (!config.rules.allowed_shipping_methods?.length) return true;
      return config.rules.allowed_shipping_methods.includes(method.code);
    });
  }, [config]);

  const selectedShippingMethod = useMemo(
    () => availableShippingMethods.find((method) => method.code === selectedShippingCode) || null,
    [availableShippingMethods, selectedShippingCode],
  );

  const unitsCount = useMemo(() => {
    if (isOfferMode && selectedOffer) return selectedOffer.units_count;
    return 1;
  }, [isOfferMode, selectedOffer]);

  const subtotal = useMemo(() => {
    if (!config || !productSnapshot) return 0;
    if (selectedOffer) return parseNumber(selectedOffer.price);
    return parseNumber(productSnapshot.base_price);
  }, [config, productSnapshot, selectedOffer]);

  const discountTotal = useMemo(() => {
    if (!selectedOffer) return 0;
    if (selectedOffer.compare_at_price == null) return 0;
    return Math.max(0, parseNumber(selectedOffer.compare_at_price) - parseNumber(selectedOffer.price));
  }, [selectedOffer]);

  const feeTotal = useMemo(() => {
    if (!config) return 0;

    if (config.fee.type === "fixed") {
      return Math.max(0, parseNumber(config.fee.value));
    }

    if (config.fee.type === "percent") {
      return Math.max(0, (subtotal * parseNumber(config.fee.value)) / 100);
    }

    return 0;
  }, [config, subtotal]);

  const shippingTotal = useMemo(() => parseNumber(selectedShippingMethod?.price), [selectedShippingMethod]);

  const grandTotal = useMemo(
    () => subtotal + shippingTotal + feeTotal,
    [subtotal, shippingTotal, feeTotal],
  );

  const requiredCountryIsFixed = useMemo(() => {
    if (!config?.rules?.countries?.length) return false;
    return config.rules.countries.length === 1;
  }, [config]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setIsLoadingConfig(true);

      try {
        const response = await fetch(
          `/api/checkout/cod/config?product_id=${encodeURIComponent(String(productId))}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
            cache: "no-store",
          },
        );

        const payload = (await response.json()) as CodCheckoutConfigResponse & {
          error?: string;
        };

        if (!mounted) return;

        if (response.status === 403) {
          setConfig(payload);
          return;
        }

        if (!response.ok) {
          setConfig(null);
          return;
        }

        setConfig(payload);
      } catch {
        if (mounted) {
          setConfig(null);
        }
      } finally {
        if (mounted) {
          setIsLoadingConfig(false);
        }
      }
    };

    run();

    return () => {
      mounted = false;
    };
  }, [productId]);

  useEffect(() => {
    if (!config || !config.product_snapshot) {
      return;
    }

    const urlParams = new URLSearchParams(searchParams.toString());
    const prefilled = parseSelectionsFromSearch(productAttributeCodes, urlParams);

    // This is an editable checkout draft synchronized with API config and Next
    // URL navigation, not a computed read-only field. Retain the existing reset.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSingleSelection(prefilled);
    setOfferSharedSelection(prefilled);

    if (config.rules.countries.length === 1) {
      setForm((prev) => ({
        ...prev,
        country_code: config.rules.countries[0],
      }));
    }

    if (config.shipping_methods.length > 0) {
      setSelectedShippingCode(config.shipping_methods[0].code);
    }
  }, [config, productAttributeCodes, searchParams]);

  const closeModal = () => {
    setIsOpen(false);
    setStep(1);
    setErrorMessage("");
  };

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableSelector =
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((element) => !element.hasAttribute("disabled"));

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    firstFocusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }

      if (event.key !== "Tab" || focusableElements.length === 0) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable?.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable?.focus();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || step < 2) return;

    if (countries.length > 0) return;

    const loadCountries = async () => {
      try {
        const response = await fetch("/api/locations/countries", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const payload = (await response.json()) as {
          countries?: Array<{ code: string; name: string }>;
        };

        if (Array.isArray(payload.countries)) {
          const nextCountries = payload.countries;
          setCountries(nextCountries);

          setForm((prev) => {
            const currentCountry = prev.country_code || config?.rules.countries?.[0] || "";
            if (currentCountry) {
              return prev;
            }

            const firstCountry = nextCountries[0]?.code || "";
            return {
              ...prev,
              country_code: firstCountry,
            };
          });
        }
      } catch {
        setCountries([]);
      }
    };

    loadCountries();
  }, [isOpen, step, countries.length, config?.rules.countries]);

  useEffect(() => {
    if (!isOpen || step < 2) return;

    const countryCode = form.country_code;
    if (!countryCode) {
      return;
    }

    const loadRegions = async () => {
      try {
        const response = await fetch(
          `/api/locations/${encodeURIComponent(countryCode)}/regions`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
          },
        );

        const payload = (await response.json()) as {
          regions?: Array<{ id: string; name: string }>;
        };

        const nextRegions = Array.isArray(payload.regions) ? payload.regions : [];
        setRegions(nextRegions);

        setForm((prev) => {
          const hasCurrent = nextRegions.some((region) => region.id === prev.region_id);
          if (hasCurrent) return prev;

          return {
            ...prev,
            region_id: nextRegions[0]?.id || "",
            city_id: "",
          };
        });
      } catch {
        setRegions([]);
      }
    };

    loadRegions();
  }, [form.country_code, isOpen, step]);

  useEffect(() => {
    if (!isOpen || step < 2) return;

    if (!form.country_code || !form.region_id) {
      return;
    }

    const loadCities = async () => {
      try {
        const response = await fetch(
          `/api/locations/${encodeURIComponent(form.country_code)}/cities?region_id=${encodeURIComponent(form.region_id)}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
          },
        );

        const payload = (await response.json()) as {
          cities?: Array<{ id: string; name: string }>;
        };

        const nextCities = Array.isArray(payload.cities) ? payload.cities : [];
        setCities(nextCities);

        setForm((prev) => {
          const hasCurrent = nextCities.some((city) => city.id === prev.city_id);
          if (hasCurrent) return prev;

          return {
            ...prev,
            city_id: nextCities[0]?.id || "",
          };
        });
      } catch {
        setCities([]);
      }
    };

    loadCities();
  }, [form.country_code, form.region_id, isOpen, step]);

  const validateStep1 = (): boolean => {
    if (!config || !productSnapshot) return false;

    const hasVariants = productSnapshot.has_variants;

    if (!isOfferMode) {
      if (!hasVariants) return true;

      if (!hasCompleteSelection(singleSelection, productAttributeCodes)) {
        setErrorMessage("Debes seleccionar todas las variantes del producto.");
        return false;
      }

      if (!variantExists(productSnapshot.variant_index, singleSelection)) {
        setErrorMessage("La combinación de variantes no es válida.");
        return false;
      }

      return true;
    }

    if (!selectedOffer) {
      setErrorMessage("Selecciona una oferta válida.");
      return false;
    }

    const requiredCodes = getRequiredCodesForOffer(selectedOffer, productAttributeCodes);

    if (selectedOffer.selection_strategy === "none") {
      return true;
    }

    if (selectedOffer.selection_strategy === "single_variant_for_all") {
      if (!hasCompleteSelection(offerSharedSelection, requiredCodes)) {
        setErrorMessage("Debes seleccionar las variantes requeridas para la oferta.");
        return false;
      }

      if (!variantExists(productSnapshot.variant_index, offerSharedSelection)) {
        setErrorMessage("La combinación de variantes para la oferta no es válida.");
        return false;
      }

      return true;
    }

    if (offerPerUnitSelections.length !== selectedOffer.units_count) {
      setErrorMessage("Debes seleccionar variantes para todas las unidades del combo.");
      return false;
    }

    for (let index = 0; index < offerPerUnitSelections.length; index += 1) {
      const selection = offerPerUnitSelections[index];

      if (!hasCompleteSelection(selection, requiredCodes)) {
        setErrorMessage(`Debes completar las variantes de la unidad ${index + 1}.`);
        return false;
      }

      if (!variantExists(productSnapshot.variant_index, selection)) {
        setErrorMessage(`La combinación de la unidad ${index + 1} no es válida.`);
        return false;
      }
    }

    return true;
  };

  const validateStep2 = (): boolean => {
    if (!form.name.trim()) {
      setErrorMessage("El nombre y apellido son obligatorios.");
      return false;
    }

    if (config?.fields.require_whatsapp && !form.whatsapp.trim()) {
      setErrorMessage("El WhatsApp es obligatorio para esta tienda.");
      return false;
    }

    if (!form.country_code.trim()) {
      setErrorMessage("Debes seleccionar un país.");
      return false;
    }

    if (!form.region_id.trim()) {
      setErrorMessage("Debes seleccionar un estado/departamento.");
      return false;
    }

    if (!form.city_id.trim()) {
      setErrorMessage("Debes seleccionar una ciudad.");
      return false;
    }

    if (!form.address1.trim()) {
      setErrorMessage("La dirección es obligatoria.");
      return false;
    }

    if (!form.address2.trim()) {
      setErrorMessage("Los datos adicionales son obligatorios.");
      return false;
    }

    if (config?.fields.require_email && !form.email.trim()) {
      setErrorMessage("El email es obligatorio para esta tienda.");
      return false;
    }

    return true;
  };

  const buildOrderSelections = (): CodOrderRequestBody["selections"] => {
    if (!isOfferMode) {
      if (!productSnapshot?.has_variants) return undefined;
      return {
        attributes: singleSelection,
      };
    }

    if (!selectedOffer) return undefined;

    if (selectedOffer.selection_strategy === "none") {
      return undefined;
    }

    if (selectedOffer.selection_strategy === "single_variant_for_all") {
      return {
        attributes: offerSharedSelection,
      };
    }

    return offerPerUnitSelections.map((attributes) => ({
      attributes,
    }));
  };

  const submitOrder = async () => {
    if (!config || !productSnapshot) return;

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const payload: CodOrderRequestBody = {
        mode: isOfferMode ? "offer" : "single",
        product_id: productSnapshot.id,
        ...(isOfferMode && selectedOffer ? { offer_id: selectedOffer.id } : {}),
        units_count: unitsCount,
        selections: buildOrderSelections(),
        shipping_address: {
          name: form.name.trim(),
          whatsapp: form.whatsapp.trim(),
          country_code: form.country_code,
          region_id: form.region_id,
          city_id: form.city_id,
          address1: form.address1.trim(),
          address2: form.address2.trim(),
          email: form.email.trim(),
        },
        shipping_method_code: selectedShippingCode,
      };

      const response = await fetch("/api/checkout/cod/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        order_id?: string;
        order_number?: string;
        redirect_url?: string;
        error?: string;
      };

      if (!response.ok || !data.order_id) {
        throw new Error(data.error || "No se pudo confirmar tu pedido COD.");
      }

      setCookie(ORDER_ID, data.order_number || data.order_id);

      showToast("Tu pedido contraentrega fue creado correctamente.", "success");
      closeModal();

      router.push(data.redirect_url || "/success");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo confirmar tu pedido COD.";

      setErrorMessage(message);
      showToast(message, "warning");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingConfig || !config || !productSnapshot) {
    return null;
  }

  if (
    !config.allowed_by_plan ||
    !config.cod_active ||
    !config.available ||
    !config.modal.modal_enabled
  ) {
    return null;
  }

  const nextLabel = step === 3 ? "Confirmar pedido" : "Continuar";

  const goNext = () => {
    setErrorMessage("");

    if (step === 1) {
      if (!validateStep1()) return;
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!validateStep2()) return;
      if (!selectedShippingCode && availableShippingMethods[0]) {
        setSelectedShippingCode(availableShippingMethods[0].code);
      }
      setStep(3);
      return;
    }

    if (!selectedShippingCode) {
      setErrorMessage("Debes seleccionar un método de envío.");
      return;
    }

    submitOrder();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setStep(1);
          setErrorMessage("");
        }}
        className="inline-flex h-fit w-full items-center justify-center rounded-full border border-neutral-900 bg-white px-6 py-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-900 hover:text-white sm:w-auto sm:min-w-[14rem]"
      >
        {config.modal.modal_cta_text}
      </button>

      {isOpen && (
        <div className="cod-modal-root fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-0 md:items-center md:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Compra rápida contraentrega"
            ref={dialogRef}
            className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white text-black shadow-2xl md:h-auto md:max-h-[90vh] md:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 md:px-6">
              <div>
                <p className="text-sm font-medium text-neutral-500">Paso {step} de 3</p>
                <h2 className="text-base font-semibold md:text-lg">Pago contraentrega</h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md px-2 py-1 text-sm font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
              >
                Cerrar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
              {step === 1 && (
                <section className="space-y-5">
                  <div className="grid gap-4 rounded-xl border border-neutral-200 p-4 md:grid-cols-[108px_1fr] md:items-center">
                    <div className="h-[96px] w-[96px] overflow-hidden rounded-lg border border-neutral-100">
                      <NextImage
                        src={productSnapshot.image || NOT_IMAGE}
                        alt={productSnapshot.title}
                        width={96}
                        height={96}
                      />
                    </div>
                    <div>
                      <p className="text-base font-semibold">{productSnapshot.title}</p>
                      <p className="mt-1 text-sm text-neutral-500">{config.modal.modal_helper_text}</p>
                      <div className="mt-2">
                        <Price
                          amount={String(productSnapshot.base_price)}
                          currencyCode={currency(config)}
                          className="text-base font-semibold"
                        />
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">
                        Cantidad: {unitsCount}
                      </p>
                    </div>
                  </div>

                  {offers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Selecciona una modalidad</p>

                      <label className="block cursor-pointer rounded-xl border border-neutral-200 p-3 transition hover:border-blue-400">
                        <input
                          type="radio"
                          name="cod-offer"
                          className="mr-2"
                          checked={!isOfferMode}
                          onChange={() => setSelectedOfferId(null)}
                        />
                        <span className="text-sm font-medium">Producto individual (1 unidad)</span>
                      </label>

                      {offers.map((offer) => (
                        <label
                          key={offer.id}
                          className={clsx(
                            "block cursor-pointer rounded-xl border p-3 transition",
                            selectedOfferId === offer.id
                              ? "border-blue-500 bg-blue-50"
                              : "border-neutral-200 hover:border-blue-400",
                          )}
                        >
                          <input
                            type="radio"
                            name="cod-offer"
                            className="mr-2"
                            checked={selectedOfferId === offer.id}
                            onChange={() => setSelectedOfferId(offer.id)}
                          />
                          <span className="text-sm font-semibold">{offer.title}</span>
                          {offer.badge_text ? (
                            <span className="ml-2 rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold uppercase text-white">
                              {offer.badge_text}
                            </span>
                          ) : null}
                          {offer.subtitle ? (
                            <p className="mt-1 text-xs text-neutral-500">{offer.subtitle}</p>
                          ) : null}
                          <div className="mt-2 flex items-center gap-3">
                            <Price
                              amount={String(offer.price)}
                              currencyCode={currency(config)}
                              className="text-sm font-semibold"
                            />
                            {offer.compare_at_price ? (
                              <Price
                                amount={String(offer.compare_at_price)}
                                currencyCode={currency(config)}
                                className="text-xs text-neutral-500 line-through"
                              />
                            ) : null}
                            <span className="text-xs text-neutral-600">{offer.units_count} unidades</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {productSnapshot.has_variants && (
                    <div className="space-y-3 rounded-xl border border-neutral-200 p-4">
                      <p className="text-sm font-medium">Variantes</p>

                      {!isOfferMode &&
                        productSnapshot.attributes.map((attribute) => (
                          <div key={`single-${attribute.code}`}>
                            <label className="mb-1 block text-xs font-medium text-neutral-600">
                              {attribute.label}
                            </label>
                            <select
                              value={singleSelection[attribute.code] || ""}
                              onChange={(event) =>
                                setSingleSelection((prev) => ({
                                  ...prev,
                                  [attribute.code]: Number(event.target.value),
                                }))
                              }
                              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                            >
                              <option value="">Selecciona</option>
                              {attribute.options.map((option) => (
                                <option key={`${attribute.code}-${option.id}`} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}

                      {isOfferMode &&
                        selectedOffer &&
                        selectedOffer.selection_strategy === "single_variant_for_all" &&
                        getRequiredCodesForOffer(selectedOffer, productAttributeCodes).map((code) => {
                          const attribute = productSnapshot.attributes.find((item) => item.code === code);
                          if (!attribute) return null;

                          return (
                            <div key={`offer-shared-${attribute.code}`}>
                              <label className="mb-1 block text-xs font-medium text-neutral-600">
                                {attribute.label}
                              </label>
                              <select
                                value={offerSharedSelection[attribute.code] || ""}
                                onChange={(event) =>
                                  setOfferSharedSelection((prev) => ({
                                    ...prev,
                                    [attribute.code]: Number(event.target.value),
                                  }))
                                }
                                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                              >
                                <option value="">Selecciona</option>
                                {attribute.options.map((option) => (
                                  <option key={`${attribute.code}-${option.id}`} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}

                      {isOfferMode &&
                        selectedOffer &&
                        selectedOffer.selection_strategy === "per_unit_variant" &&
                        offerPerUnitSelections.map((selection, unitIndex) => (
                          <div key={`per-unit-${unitIndex}`} className="space-y-2 rounded-lg border border-neutral-200 p-3">
                            <p className="text-xs font-semibold text-neutral-700">Unidad {unitIndex + 1}</p>
                            {getRequiredCodesForOffer(selectedOffer, productAttributeCodes).map((code) => {
                              const attribute = productSnapshot.attributes.find((item) => item.code === code);
                              if (!attribute) return null;

                              return (
                                <div key={`per-unit-${unitIndex}-${code}`}>
                                  <label className="mb-1 block text-xs font-medium text-neutral-600">
                                    {attribute.label}
                                  </label>
                                  <select
                                    value={selection[attribute.code] || ""}
                                    onChange={(event) =>
                                      setOfferPerUnitSelections((prev) =>
                                        prev.map((entry, currentIndex) =>
                                          currentIndex === unitIndex
                                            ? {
                                                ...entry,
                                                [attribute.code]: Number(event.target.value),
                                              }
                                            : entry,
                                        ),
                                      )
                                    }
                                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                                  >
                                    <option value="">Selecciona</option>
                                    {attribute.options.map((option) => (
                                      <option key={`${attribute.code}-${option.id}`} value={option.id}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                    </div>
                  )}
                </section>
              )}

              {step === 2 && (
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold">Datos de envío</h3>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-medium text-neutral-700">
                      Nombre y apellido *
                      <input
                        type="text"
                        value={form.name}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="text-xs font-medium text-neutral-700">
                      WhatsApp {config.fields.require_whatsapp ? "*" : ""}
                      <input
                        type="tel"
                        value={form.whatsapp}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, whatsapp: event.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  {!requiredCountryIsFixed && (
                    <label className="block text-xs font-medium text-neutral-700">
                      País *
                      <select
                        value={form.country_code}
                        onChange={(event) => {
                          // Every country change resets region_id. Discard its
                          // dependent city list before the next location request.
                          setCities([]);
                          if (!event.target.value) {
                            setRegions([]);
                          }
                          setForm((prev) => ({
                            ...prev,
                            country_code: event.target.value,
                            region_id: "",
                            city_id: "",
                          }));
                        }}
                        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      >
                        <option value="">Selecciona</option>
                        {(countries.length > 0 ? countries : []).map((country) => (
                          <option key={country.code} value={country.code}>
                            {country.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {requiredCountryIsFixed && (
                    <p className="text-xs text-neutral-500">
                      País: <span className="font-medium text-neutral-700">{form.country_code}</span>
                    </p>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-medium text-neutral-700">
                      Departamento / Estado *
                      <select
                        value={form.region_id}
                        onChange={(event) => {
                          if (!event.target.value) {
                            setCities([]);
                          }
                          setForm((prev) => ({
                            ...prev,
                            region_id: event.target.value,
                            city_id: "",
                          }));
                        }}
                        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      >
                        <option value="">Selecciona</option>
                        {regions.map((region) => (
                          <option key={region.id} value={region.id}>
                            {region.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-medium text-neutral-700">
                      Ciudad *
                      <select
                        value={form.city_id}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, city_id: event.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      >
                        <option value="">Selecciona</option>
                        {cities.map((city) => (
                          <option key={city.id} value={city.id}>
                            {city.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="block text-xs font-medium text-neutral-700">
                    Dirección *
                    <input
                      type="text"
                      value={form.address1}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, address1: event.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block text-xs font-medium text-neutral-700">
                    Datos adicionales *
                    <input
                      type="text"
                      value={form.address2}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, address2: event.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block text-xs font-medium text-neutral-700">
                    Email {config.fields.require_email ? "*" : ""}
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, email: event.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </label>
                </section>
              )}

              {step === 3 && (
                <section className="space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold">Método de envío</h3>
                    <div className="mt-2 space-y-2">
                      {availableShippingMethods.map((method) => (
                        <label
                          key={method.code}
                          className={clsx(
                            "block cursor-pointer rounded-lg border p-3 transition",
                            selectedShippingCode === method.code
                              ? "border-blue-500 bg-blue-50"
                              : "border-neutral-200 hover:border-blue-400",
                          )}
                        >
                          <input
                            type="radio"
                            name="cod-shipping"
                            className="mr-2"
                            checked={selectedShippingCode === method.code}
                            onChange={() => setSelectedShippingCode(method.code)}
                          />
                          <span className="text-sm font-medium">{method.label}</span>
                          {method.description ? (
                            <p className="mt-1 text-xs text-neutral-500">{method.description}</p>
                          ) : null}
                          <div className="mt-1 text-xs font-semibold text-neutral-700">
                            <Price
                              amount={String(method.price)}
                              currencyCode={currency(config)}
                              className="text-xs font-semibold"
                            />
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 p-4">
                    <h4 className="text-sm font-semibold">Resumen</h4>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-600">Subtotal</span>
                        <Price amount={String(subtotal)} currencyCode={currency(config)} className="font-medium" />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-neutral-600">Envío</span>
                        <Price amount={String(shippingTotal)} currencyCode={currency(config)} className="font-medium" />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-neutral-600">Descuentos</span>
                        <Price amount={String(discountTotal)} currencyCode={currency(config)} className="font-medium" />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-neutral-600">Fee COD</span>
                        <Price amount={String(feeTotal)} currencyCode={currency(config)} className="font-medium" />
                      </div>

                      <div className="mt-2 border-t border-neutral-200 pt-2">
                        <div className="flex items-center justify-between text-base font-semibold">
                          <span>Total</span>
                          <Price amount={String(grandTotal)} currencyCode={currency(config)} className="text-base font-semibold" />
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-neutral-500">
                      Método de pago: <strong>Contraentrega</strong>. Estado inicial:
                      <strong> Pago pendiente</strong>.
                    </p>
                  </div>
                </section>
              )}
            </div>

            <div className="border-t border-neutral-200 px-4 py-3 md:px-6">
              {errorMessage ? <p className="mb-2 text-sm text-red-600">{errorMessage}</p> : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    if (step === 1) {
                      closeModal();
                      return;
                    }
                    setErrorMessage("");
                    setStep((prev) => (prev === 1 ? 1 : ((prev - 1) as Step)));
                  }}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
                >
                  {step === 1 ? "Cancelar" : "Atrás"}
                </button>

                <button
                  type="button"
                  onClick={goNext}
                  disabled={isSubmitting}
                  className={clsx(
                    "rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700",
                    isSubmitting && "cursor-wait opacity-60",
                  )}
                >
                  {isSubmitting ? "Procesando..." : nextLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
