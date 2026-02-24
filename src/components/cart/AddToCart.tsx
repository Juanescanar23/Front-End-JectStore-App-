"use client";

import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useAppDispatch } from "@/store/hooks";
import { clearCart } from "@/store/slices/cart-slice";
import { ORDER_ID } from "@/utils/constants";
import { useAddProduct } from "@utils/hooks/useAddToCart";
import LoadingDots from "@components/common/icons/LoadingDots";
import { getVariantInfo } from "@utils/hooks/useVariantInfo";
import { getCartToken } from "@utils/getCartToken";
import { safeParse, setCookie } from "@utils/helper";
import { useGuestCartToken } from "@utils/hooks/useGuestCartToken";
import { useCustomToast } from "@utils/hooks/useToast";

type CodConfigResponse = {
  enabled: boolean;
  available: boolean;
  reason: string | null;
  plan_allows_checkout: boolean;
  product_requested: boolean;
  product_found: boolean;
  product_id: number | null;
  product_type: string | null;
  product_is_stockable: boolean | null;
};

type CountryOption = {
  id: number;
  code: string;
  name: string;
};

type StateOption = {
  id: number;
  country_id?: number;
  country_code?: string;
  code: string;
  default_name: string;
};

type CodFormData = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
  state: string;
};

function SubmitButton({
  selectedVariantId,
  pending,
  type,
  isSaleable,
}: {
  selectedVariantId: boolean;
  pending: boolean;
  type: string;
  isSaleable: string;
}) {
  const buttonClasses =
    "relative flex h-fit w-full items-center justify-center rounded-full bg-blue-600 p-4 text-sm font-semibold tracking-wide text-white sm:w-auto sm:min-w-[12rem]";
  const disabledClasses = "cursor-wait opacity-60";

  if (!isSaleable || isSaleable === "") {
    return (
      <button
        aria-disabled
        aria-label="Agotado"
        type="button"
        disabled
        className={clsx(buttonClasses, "opacity-60 !cursor-not-allowed")}
      >
        Agotado
      </button>
    );
  }

  if (!selectedVariantId && type === "configurable") {
    return (
      <button
        aria-disabled
        aria-label="Selecciona una opción"
        type="button"
        disabled={!selectedVariantId}
        className={clsx(buttonClasses, "opacity-60 !cursor-not-allowed")}
      >
        Agregar al carrito
      </button>
    );
  }

  return (
    <button
      aria-disabled={pending}
      aria-label="Agregar al carrito"
      type="submit"
      className={clsx(buttonClasses, {
        "hover:opacity-90": true,
        [disabledClasses]: pending,
      })}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        if (pending) e.preventDefault();
      }}
    >
      <div className="absolute left-0 ml-4">
        {pending ? <LoadingDots className="mb-3 bg-white" /> : ""}
      </div>
      Agregar al carrito
    </button>
  );
}

function WhatsAppButton({ href }: { href?: string | null }) {
  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Consultar por WhatsApp"
      className="inline-flex h-fit w-full items-center justify-center rounded-full border border-neutral-900 bg-white px-6 py-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-900 hover:text-white sm:w-auto sm:min-w-[10rem]"
    >
      WhatsApp
    </a>
  );
}

function CodAvailability({
  type,
  selectedProductId,
  isLoading,
  config,
}: {
  type: string;
  selectedProductId: number | null;
  isLoading: boolean;
  config: CodConfigResponse | null;
}) {
  if (type === "configurable" && !selectedProductId) {
    return (
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
        Selecciona una variante para verificar pago contra entrega.
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
        Verificando pago contra entrega...
      </p>
    );
  }

  if (!config) {
    return null;
  }

  const toneClass = config.available
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-amber-200 bg-amber-50 text-amber-800";

  let message = "Pago contra entrega no disponible para este producto.";

  if (config.available) {
    message = "Pago contra entrega disponible para este producto.";
  } else if (config.reason === "non_stockable_product") {
    message = "Este producto no admite pago contra entrega porque no requiere envío.";
  } else if (config.reason === "checkout_disabled_by_plan") {
    message = "Tu plan actual no tiene checkout habilitado.";
  } else if (config.reason === "cod_disabled") {
    message = "Pago contra entrega está desactivado en esta tienda.";
  } else if (config.reason === "product_not_found") {
    message = "No se pudo validar el producto para pago contra entrega.";
  } else if (config.reason === "request_failed") {
    message = "No se pudo validar COD en este momento. Inténtalo nuevamente.";
  }

  return (
    <p className={clsx("mt-2 rounded-md border px-3 py-2 text-xs", toneClass)}>
      {message}
    </p>
  );
}

const buildFallbackEmail = (phone: string): string => {
  const cleanPhone = phone.replace(/\D+/g, "").slice(0, 20);
  const timestamp = Date.now();

  if (typeof window === "undefined") {
    return `cod-${cleanPhone || timestamp}@store.local`;
  }

  const host = window.location.hostname.replace(/[^a-zA-Z0-9.-]/g, "");

  return `cod-${cleanPhone || timestamp}@${host || "store.local"}`;
};

const resolveErrorMessage = (payload: any, fallback: string): string => {
  const candidate =
    payload?.error?.message?.message ??
    payload?.error?.message ??
    payload?.error ??
    payload?.message ??
    payload?.errors?.[0]?.message;

  if (typeof candidate === "string" && candidate.trim() !== "") {
    return candidate;
  }

  return fallback;
};

export function AddToCart({
  productSwatchReview,
  index,
  productId,
  userInteracted,
  whatsappUrl,
}: {
  productSwatchReview: any;
  productId: string;
  index: Record<string, Record<string, number>>;
  userInteracted: boolean;
  whatsappUrl?: string | null;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { createGuestToken, resetGuestToken } = useGuestCartToken();
  const { showToast } = useCustomToast();
  const isSaleable = productSwatchReview?.isSaleable || "";
  const { onAddToCart, isCartLoading } = useAddProduct();

  const { handleSubmit, setValue, control, register } = useForm({
    defaultValues: {
      quantity: 1,
      isBuyNow: false,
    },
  });

  const quantity = useWatch({
    control,
    name: "quantity",
  });

  const increment = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setValue("quantity", Number(quantity) + 1);
  };

  const decrement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setValue("quantity", Math.max(1, Number(quantity) - 1));
  };

  const searchParams = useSearchParams();
  const type = productSwatchReview?.type;

  const superAttributes = productSwatchReview?.superAttributeOptions
    ? safeParse(productSwatchReview.superAttributeOptions)
    : productSwatchReview?.superAttributes || [];

  const isConfigurable = superAttributes.length > 0;

  const { productid: selectedVariantId, Instock: checkStock } = getVariantInfo(
    isConfigurable,
    searchParams.toString(),
    superAttributes,
    JSON.stringify(index),
  );

  const buttonStatus = !!selectedVariantId;

  const normalizedProductId = useMemo(() => {
    const parsed = Number(String(productId).split("/").pop() ?? "");

    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [productId]);

  const selectedProductIdForCod = useMemo(() => {
    if (type === "configurable") {
      const parsedVariant = Number(selectedVariantId);

      return Number.isFinite(parsedVariant) && parsedVariant > 0
        ? parsedVariant
        : null;
    }

    return normalizedProductId;
  }, [type, selectedVariantId, normalizedProductId]);

  const [codConfig, setCodConfig] = useState<CodConfigResponse | null>(null);
  const [isCodFormOpen, setIsCodFormOpen] = useState(false);
  const [isCodSubmitting, setIsCodSubmitting] = useState(false);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [statesByCountry, setStatesByCountry] = useState<Record<string, StateOption[]>>({});
  const [codFormErrors, setCodFormErrors] = useState<Partial<Record<keyof CodFormData, string>>>({});
  const [codForm, setCodForm] = useState<CodFormData>({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    postcode: "",
    country: "",
    state: "",
  });

  useEffect(() => {
    let isCancelled = false;

    if (!selectedProductIdForCod) {
      return;
    }

    fetch(`/api/checkout/cod/config?product_id=${selectedProductIdForCod}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`COD config request failed with status ${response.status}`);
        }

        return (await response.json()) as CodConfigResponse;
      })
      .then((payload) => {
        if (!isCancelled) {
          setCodConfig(payload);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setCodConfig({
            enabled: false,
            available: false,
            reason: "request_failed",
            plan_allows_checkout: false,
            product_requested: true,
            product_found: false,
            product_id: selectedProductIdForCod,
            product_type: null,
            product_is_stockable: null,
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedProductIdForCod]);

  const codConfigForSelection = useMemo(() => {
    if (!selectedProductIdForCod) {
      return null;
    }

    return codConfig?.product_id === selectedProductIdForCod ? codConfig : null;
  }, [codConfig, selectedProductIdForCod]);

  const stateOptions = useMemo(() => {
    if (!codForm.country) {
      return [];
    }

    return statesByCountry[codForm.country] || [];
  }, [statesByCountry, codForm.country]);

  const hasStateOptions = stateOptions.length > 0;

  const updateCodField = <K extends keyof CodFormData>(field: K, value: CodFormData[K]) => {
    setCodForm((prev) => ({ ...prev, [field]: value }));
    setCodFormErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const loadLocationData = async () => {
    if (countries.length > 0 && Object.keys(statesByCountry).length > 0) {
      return;
    }

    setIsLocationLoading(true);

    try {
      const [countriesRes, statesRes] = await Promise.all([
        fetch("/api/locations/countries", { cache: "no-store" }),
        fetch("/api/locations/states", { cache: "no-store" }),
      ]);

      const countriesJson = countriesRes.ok ? await countriesRes.json() : {};
      const statesJson = statesRes.ok ? await statesRes.json() : {};

      const fetchedCountries: CountryOption[] = Array.isArray(countriesJson?.data)
        ? countriesJson.data
            .filter((item: any) => item?.code && item?.name)
            .map((item: any) => ({
              id: Number(item.id),
              code: String(item.code),
              name: String(item.name),
            }))
        : [];

      const rawStates = statesJson?.data && typeof statesJson.data === "object"
        ? statesJson.data
        : {};

      const nextStatesByCountry: Record<string, StateOption[]> = {};

      Object.entries(rawStates).forEach(([countryCode, states]) => {
        if (!Array.isArray(states)) {
          return;
        }

        nextStatesByCountry[countryCode] = states
          .filter((state: any) => state?.code && state?.default_name)
          .map((state: any) => ({
            id: Number(state.id),
            country_id: state.country_id ? Number(state.country_id) : undefined,
            country_code: state.country_code ? String(state.country_code) : undefined,
            code: String(state.code),
            default_name: String(state.default_name),
          }));
      });

      setCountries(fetchedCountries);
      setStatesByCountry(nextStatesByCountry);

      if (!codForm.country && fetchedCountries.length > 0) {
        const nextCountry = fetchedCountries[0].code;
        const nextStates = nextStatesByCountry[nextCountry] || [];

        setCodForm((prev) => ({
          ...prev,
          country: nextCountry,
          state: nextStates[0]?.code || "",
        }));
      }
    } catch {
      showToast("No se pudieron cargar países y estados para el formulario COD.", "warning");
    } finally {
      setIsLocationLoading(false);
    }
  };

  const toggleCodForm = async () => {
    const nextOpen = !isCodFormOpen;
    setIsCodFormOpen(nextOpen);

    if (nextOpen) {
      await loadLocationData();
    }
  };

  const validateCodForm = (): boolean => {
    const errors: Partial<Record<keyof CodFormData, string>> = {};

    if (!codForm.firstName.trim()) errors.firstName = "Ingresa tu nombre.";
    if (!codForm.lastName.trim()) errors.lastName = "Ingresa tu apellido.";
    if (!codForm.phone.trim()) errors.phone = "Ingresa tu teléfono.";
    if (!codForm.address.trim()) errors.address = "Ingresa tu dirección.";
    if (!codForm.city.trim()) errors.city = "Ingresa tu ciudad.";
    if (!codForm.postcode.trim()) errors.postcode = "Ingresa tu código postal.";
    if (!codForm.country.trim()) errors.country = "Selecciona un país.";
    if (!codForm.state.trim()) {
      errors.state = hasStateOptions
        ? "Selecciona un estado/provincia."
        : "Ingresa tu estado/departamento/provincia.";
    }

    setCodFormErrors(errors);

    return Object.keys(errors).length === 0;
  };

  const postApi = async (
    path: string,
    token: string,
    body: Record<string, unknown>,
  ): Promise<any> => {
    const response = await fetch(`/api/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(resolveErrorMessage(payload, "No se pudo completar la solicitud."));
    }

    return payload;
  };

  const submitCodQuickOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedProductIdForCod) {
      showToast("Selecciona una variante válida para continuar.", "warning");
      return;
    }

    if (!codConfigForSelection?.available) {
      showToast("Pago contra entrega no está disponible para este producto.", "warning");
      return;
    }

    if (!validateCodForm()) {
      showToast("Completa los datos requeridos para continuar.", "warning");
      return;
    }

    setIsCodSubmitting(true);

    try {
      let token = getCartToken();

      if (!token) {
        token = await createGuestToken();
      }

      if (!token) {
        throw new Error("No se pudo iniciar una sesión de compra. Intenta nuevamente.");
      }

      const quantityValue = Math.max(1, Number(quantity) || 1);
      const fallbackEmail = buildFallbackEmail(codForm.phone);
      const customerEmail = codForm.email.trim() || fallbackEmail;

      const addToCartPayload = await postApi("cart/addToCart", token, {
        productId: selectedProductIdForCod,
        quantity: quantityValue,
      });

      const addToCartResult = addToCartPayload?.data?.createAddProductInCart?.addProductInCart;

      if (!addToCartResult?.success) {
        throw new Error(resolveErrorMessage(addToCartPayload, "No se pudo agregar el producto al carrito."));
      }

      const addressPayload = await postApi("checkout/saveCheckoutAddresses", token, {
        billingFirstName: codForm.firstName.trim(),
        billingLastName: codForm.lastName.trim(),
        billingEmail: customerEmail,
        billingAddress: codForm.address.trim(),
        billingCity: codForm.city.trim(),
        billingCountry: codForm.country.trim(),
        billingState: codForm.state.trim(),
        billingPostcode: codForm.postcode.trim(),
        billingPhoneNumber: codForm.phone.trim(),
        billingCompanyName: "",
        useForShipping: true,
      });

      const savedAddress = addressPayload?.data?.createCheckoutAddress?.checkoutAddress;

      if (!savedAddress?.success) {
        throw new Error(resolveErrorMessage(addressPayload, "No se pudieron guardar los datos de envío."));
      }

      const shippingRatesPayload = await postApi("checkout/shippingMethods", token, {});
      const shippingRates = Array.isArray(shippingRatesPayload?.data)
        ? shippingRatesPayload.data
        : [];

      if (shippingRates.length === 0) {
        throw new Error("No hay métodos de envío disponibles para esta dirección.");
      }

      const selectedShippingMethod = shippingRates[0]?.method;

      if (!selectedShippingMethod) {
        throw new Error("No se pudo seleccionar un método de envío.");
      }

      const saveShippingPayload = await postApi("checkout/saveShipping", token, {
        shippingMethod: selectedShippingMethod,
      });

      const savedShipping =
        saveShippingPayload?.data?.createCheckoutShippingMethod?.checkoutShippingMethod;

      if (!savedShipping?.success) {
        throw new Error(resolveErrorMessage(saveShippingPayload, "No se pudo guardar el método de envío."));
      }

      const paymentMethodsPayload = await postApi("checkout/paymentMethods", token, {});
      const paymentMethods = Array.isArray(paymentMethodsPayload?.data)
        ? paymentMethodsPayload.data
        : [];

      const codPaymentMethod = paymentMethods.find((method: any) =>
        method?.method === "cashondelivery" && method?.isAllowed !== false,
      );

      if (!codPaymentMethod?.method) {
        throw new Error("Pago contra entrega no está disponible para esta orden.");
      }

      const savePaymentPayload = await postApi("checkout/savePayment", token, {
        paymentMethod: codPaymentMethod.method,
      });

      const savedPayment =
        savePaymentPayload?.data?.createCheckoutPaymentMethod?.checkoutPaymentMethod;

      if (!savedPayment?.success) {
        throw new Error(resolveErrorMessage(savePaymentPayload, "No se pudo guardar el método de pago."));
      }

      const placeOrderPayload = await postApi("checkout/placeOrder", token, {});
      const checkoutOrder = placeOrderPayload?.data?.createCheckoutOrder?.checkoutOrder;
      const orderId = checkoutOrder?.orderId;

      if (!orderId) {
        throw new Error(resolveErrorMessage(placeOrderPayload, "No pudimos finalizar tu pedido."));
      }

      setCookie(ORDER_ID, String(orderId));
      dispatch(clearCart());
      await resetGuestToken();
      showToast("Pedido contra entrega creado correctamente.", "success");
      router.push("/success");
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "No se pudo completar el pedido contra entrega.";

      showToast(message, "danger");
    } finally {
      setIsCodSubmitting(false);
    }
  };

  const actionWithVariant = async (data: any) => {
    const pid =
      type === "configurable"
        ? String(selectedVariantId)
        : (String(productId).split("/").pop() ?? "");

    onAddToCart({
      productId: pid,
      quantity: data.quantity,
    });
  };

  return (
    <>
      {!checkStock && type === "configurable" && userInteracted && (
        <div className="my-2 gap-1 px-2 py-1 font-bold">
          <h1>NO HAY STOCK DISPONIBLE</h1>
        </div>
      )}

      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={handleSubmit(actionWithVariant)}
      >
        <div className="flex items-center justify-center">
          <div className="flex items-center rounded-full border-2 border-blue-500">
            <div
              aria-label="Disminuir cantidad"
              role="button"
              className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-l-full text-gray-600 transition-colors hover:text-gray-800 dark:text-white hover:dark:text-white/[80%]"
              onClick={decrement}
            >
              <MinusIcon className="h-4 w-4" />
            </div>

            <input
              type="hidden"
              {...register("quantity", { valueAsNumber: true })}
            />

            <div className="flex h-12 min-w-[3rem] items-center justify-center px-4 font-medium text-gray-800 dark:text-white">
              {quantity}
            </div>

            <div
              aria-label="Aumentar cantidad"
              role="button"
              className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-r-full text-gray-600 transition-colors hover:text-gray-800 dark:text-white hover:dark:text-white/[80%]"
              onClick={increment}
            >
              <PlusIcon className="h-4 w-4" />
            </div>
          </div>
        </div>

        <SubmitButton
          pending={isCartLoading}
          selectedVariantId={buttonStatus}
          type={type || ""}
          isSaleable={isSaleable}
        />

        <WhatsAppButton href={whatsappUrl} />
      </form>

      <CodAvailability
        type={type || ""}
        selectedProductId={selectedProductIdForCod}
        isLoading={Boolean(selectedProductIdForCod) && !codConfigForSelection}
        config={codConfigForSelection}
      />

      {codConfigForSelection?.available ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={toggleCodForm}
            disabled={isCodSubmitting}
            className="inline-flex w-full items-center justify-center rounded-xl bg-[#2CC317] px-5 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCodFormOpen ? "Ocultar formulario COD" : "Compra y paga al recibir"}
          </button>

          {isCodFormOpen ? (
            <form
              className="mt-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900"
              onSubmit={submitCodQuickOrder}
            >
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                Completa tus datos para confirmar el pedido contra entrega
              </p>
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                Cantidad actual: <strong>{Math.max(1, Number(quantity) || 1)}</strong>
              </p>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <input
                    type="text"
                    placeholder="Nombre"
                    value={codForm.firstName}
                    onChange={(event) => updateCodField("firstName", event.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                  />
                  {codFormErrors.firstName ? (
                    <p className="mt-1 text-xs text-red-500">{codFormErrors.firstName}</p>
                  ) : null}
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="Apellido"
                    value={codForm.lastName}
                    onChange={(event) => updateCodField("lastName", event.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                  />
                  {codFormErrors.lastName ? (
                    <p className="mt-1 text-xs text-red-500">{codFormErrors.lastName}</p>
                  ) : null}
                </div>

                <div>
                  <input
                    type="tel"
                    placeholder="Teléfono"
                    value={codForm.phone}
                    onChange={(event) => updateCodField("phone", event.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                  />
                  {codFormErrors.phone ? (
                    <p className="mt-1 text-xs text-red-500">{codFormErrors.phone}</p>
                  ) : null}
                </div>

                <div>
                  <input
                    type="email"
                    placeholder="Email (opcional)"
                    value={codForm.email}
                    onChange={(event) => updateCodField("email", event.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <input
                    type="text"
                    placeholder="Dirección"
                    value={codForm.address}
                    onChange={(event) => updateCodField("address", event.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                  />
                  {codFormErrors.address ? (
                    <p className="mt-1 text-xs text-red-500">{codFormErrors.address}</p>
                  ) : null}
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="Ciudad"
                    value={codForm.city}
                    onChange={(event) => updateCodField("city", event.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                  />
                  {codFormErrors.city ? (
                    <p className="mt-1 text-xs text-red-500">{codFormErrors.city}</p>
                  ) : null}
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="Código postal"
                    value={codForm.postcode}
                    onChange={(event) => updateCodField("postcode", event.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                  />
                  {codFormErrors.postcode ? (
                    <p className="mt-1 text-xs text-red-500">{codFormErrors.postcode}</p>
                  ) : null}
                </div>

                <div>
                  <select
                    value={codForm.country}
                    onChange={(event) => {
                      const nextCountry = event.target.value;
                      const nextStates = statesByCountry[nextCountry] || [];
                      setCodForm((prev) => ({
                        ...prev,
                        country: nextCountry,
                        state: nextStates[0]?.code || "",
                      }));
                      setCodFormErrors((prev) => ({
                        ...prev,
                        country: undefined,
                        state: undefined,
                      }));
                    }}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                    disabled={isLocationLoading}
                  >
                    <option value="">Selecciona país</option>
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                  {codFormErrors.country ? (
                    <p className="mt-1 text-xs text-red-500">{codFormErrors.country}</p>
                  ) : null}
                </div>

                <div>
                  {hasStateOptions ? (
                    <select
                      value={codForm.state}
                      onChange={(event) => updateCodField("state", event.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                      disabled={isLocationLoading || !codForm.country}
                    >
                      <option value="">Selecciona estado/provincia</option>
                      {stateOptions.map((state) => (
                        <option key={`${state.code}-${state.id}`} value={state.code}>
                          {state.default_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Estado / Provincia / Departamento"
                      value={codForm.state}
                      onChange={(event) => updateCodField("state", event.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                      disabled={isLocationLoading || !codForm.country}
                    />
                  )}
                  {codFormErrors.state ? (
                    <p className="mt-1 text-xs text-red-500">{codFormErrors.state}</p>
                  ) : null}
                </div>
              </div>

              <button
                type="submit"
                disabled={isCodSubmitting}
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#2CC317] px-5 py-3 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCodSubmitting ? "Procesando pedido..." : "Confirmar pedido contra entrega"}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
