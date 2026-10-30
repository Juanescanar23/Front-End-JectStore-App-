"use client";
import { FC, useState, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { AddressDataTypes } from "@/types/types";
import { EMAIL, getLocalStorage } from "@/store/local-storage";
import { IS_VALID_ADDRESS, IS_VALID_PHONE, IS_VALID_INPUT } from "@/utils/constants";
import { isObject } from "@/utils/type-guards";
import { useCheckout } from "@utils/hooks/useCheckout";
import InputText from "@components/common/form/Input";
import { ProceedToCheckout } from "./ProceedToCheckout";
import CheckBox from "@components/theme/ui/element/Checkbox";
import { useDispatch } from "react-redux";
import { setCheckoutAddresses } from "@/store/slices/cart-slice";
import { checkoutCountryCode, checkoutLocationAfterCountryChange, checkoutLocationError, checkoutLocationForReset, checkoutRegionCode, isCheckoutAddressSaveSuccessful, type CheckoutLocations } from "@/utils/checkout-address-location";


export const GuestAddAdressForm: FC<{
  billingAddress?: AddressDataTypes | null;
  shippingAddress?: AddressDataTypes | null;
}> = ({ billingAddress: initialBilling, shippingAddress: initialShipping }) => {
  const email = getLocalStorage(EMAIL);
  const dispatch = useDispatch();
  const [isOpen, setIsOpen] = useState(true);
  const [billingAddress, setBillingAddress] = useState<AddressDataTypes | null>(
    initialBilling ?? null
  );
  const [shippingAddress, setShippingAddress] =
    useState<AddressDataTypes | null>(initialShipping ?? null);
  const [locations, setLocations] = useState<CheckoutLocations>({ countries: [], states: {} });
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsError, setLocationsError] = useState(false);
  const [locationAttempt, setLocationAttempt] = useState(0);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    getFieldState,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({
    mode: "onSubmit",
    defaultValues: {
      billing: {
        email: billingAddress?.email ?? email ?? "",
        firstName: billingAddress?.firstName || "",
        lastName: billingAddress?.lastName || "",
        companyName: billingAddress?.companyName || "",
        address: billingAddress?.address || "",
        country: checkoutCountryCode(billingAddress?.country),
        state: billingAddress?.state || "",
        city: billingAddress?.city || "",
        postcode: billingAddress?.postcode || "",
        phone: billingAddress?.phone || "",
      },
      shipping: {
        email: shippingAddress?.email ?? email ?? "",
        firstName: shippingAddress?.firstName || "",
        lastName: shippingAddress?.lastName || "",
        companyName: shippingAddress?.companyName || "",
        address: shippingAddress?.address || "",
        country: checkoutCountryCode(shippingAddress?.country),
        state: shippingAddress?.state || "",
        city: shippingAddress?.city || "",
        postcode: shippingAddress?.postcode || "",
        phone: shippingAddress?.phone || "",
      },
      useForShipping: true,
    },
  });

  const billingCountry = useWatch({ control, name: "billing.country" });
  const shippingCountry = useWatch({ control, name: "shipping.country" });
  const billingState = useWatch({ control, name: "billing.state" });
  const shippingState = useWatch({ control, name: "shipping.state" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetch("/api/checkout/locations", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("locations-unavailable");
        const data = await response.json() as CheckoutLocations;
        if (!Array.isArray(data.countries) || data.countries.length === 0 || !data.states) throw new Error("locations-unavailable");
        if (active) { setLocations(data); setLocationsLoading(false); setLocationsError(false); }
      })
      .catch(() => {
        if (active) { setLocationsError(true); setLocationsLoading(false); }
      });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [locationAttempt]);

  useEffect(() => {
    if (initialBilling || initialShipping) {
      const billing = initialBilling ?? null;
      const shipping = initialShipping ?? null;
      requestAnimationFrame(() => {
        setBillingAddress(billing);
        setShippingAddress(shipping);
      });

      const editedBillingCountry = getFieldState("billing.country");
      const editedShippingCountry = getFieldState("shipping.country");
      const billingLocation = checkoutLocationForReset({ country: checkoutCountryCode(initialBilling?.country), state: initialBilling?.state || "" },
        getValues("billing"), editedBillingCountry.isDirty || editedBillingCountry.isTouched);
      const shippingLocation = checkoutLocationForReset({ country: checkoutCountryCode(initialShipping?.country), state: initialShipping?.state || "" },
        getValues("shipping"), editedShippingCountry.isDirty || editedShippingCountry.isTouched);
      reset({
        billing: {
          email: initialBilling?.email ?? email ?? "",
          firstName: initialBilling?.firstName || "",
          lastName: initialBilling?.lastName || "",
          companyName: initialBilling?.companyName || "",
          address: initialBilling?.address || "",
          country: billingLocation.country,
          state: billingLocation.state,
          city: initialBilling?.city || "",
          postcode: initialBilling?.postcode || "",
          phone: initialBilling?.phone || "",
        },
        shipping: {
          email: initialShipping?.email ?? email ?? "",
          firstName: initialShipping?.firstName || "",
          lastName: initialShipping?.lastName || "",
          companyName: initialShipping?.companyName || "",
          address: initialShipping?.address || "",
          country: shippingLocation.country,
          state: shippingLocation.state,
          city: initialShipping?.city || "",
          postcode: initialShipping?.postcode || "",
          phone: initialShipping?.phone || "",
        },
        useForShipping: true,
      }, { keepDirtyValues: true });
    }
  }, [initialBilling, initialShipping, reset, email, getValues, getFieldState]);

  const { isLoadingToSave, saveCheckoutAddress } = useCheckout();

  const watchUseForShipping = useWatch({
    control,
    name: "useForShipping",
    defaultValue: true,
  });

  const addGuestAddress = async (data: any) => {
    if (isLoadingToSave || locationsLoading || locationsError) return;
    const billing = data?.billing;
    const shipping = data?.shipping;

    const useForShipping = Boolean(data.useForShipping);
    const shippingSource = useForShipping ? billing : shipping;

    const payload: any = {
      billingFirstName: billing.firstName,
      billingLastName: billing.lastName,
      billingEmail: billing.email ?? email ?? "",
      billingAddress: billing.address,
      billingCity: billing.city,
      billingCountry: checkoutCountryCode(billing.country),
      billingState: checkoutRegionCode(billing.country, billing.state, locations),
      billingPostcode: billing.postcode,
      billingPhoneNumber: billing.phone,
      billingCompanyName: billing.companyName,
      useForShipping,
    };

    if (!useForShipping) {
      payload.shippingFirstName = shipping.firstName;
      payload.shippingLastName = shipping.lastName;
      payload.shippingEmail = shipping.email ?? email ?? "";
      payload.shippingAddress = shipping.address;
      payload.shippingCity = shipping.city;
      payload.shippingCountry = checkoutCountryCode(shipping.country);
      payload.shippingState = checkoutRegionCode(shipping.country, shipping.state, locations);
      payload.shippingPostcode = shipping.postcode;
      payload.shippingPhoneNumber = shipping.phone;
      payload.shippingCompanyName = shipping.companyName;
    }

    try {
      const response = await saveCheckoutAddress(payload as any);
      if (!isCheckoutAddressSaveSuccessful(response)) return;
      dispatch(
        setCheckoutAddresses({
          billing: {
            ...billing,
            email: billing.email ?? email ?? "",
          },
          shipping: {
            ...shippingSource,
            email: shippingSource.email ?? email ?? "",
          },
        })
      );
      setBillingAddress({
        ...billing,
        email: billing.email ?? email ?? "",
      } as AddressDataTypes);

      setShippingAddress({
        ...shippingSource,
        email: shippingSource.email ?? email ?? "",
      } as AddressDataTypes);

      setIsOpen(true);
    } catch (error) {
      console.error("Failed to save checkout address", error);
    }
  };

  const showSummary = isObject(shippingAddress) && isObject(billingAddress);

  const locationFields = (kind: "billing" | "shipping") => {
    const country = kind === "billing" ? billingCountry : shippingCountry;
    const state = kind === "billing" ? billingState : shippingState;
    const regions = locations.states[checkoutCountryCode(country)] || [];
    const countryRegistration = register(`${kind}.country`, {
      validate: (value) => !locationsLoading && !locationsError
        && checkoutLocationError(value, "", locations) !== "country" || "Selecciona un país de la lista",
    });
    const stateRegistration = register(`${kind}.state`, {
      validate: (value) => checkoutLocationError(country, value, locations) !== "state" || "Selecciona el estado o región de ese país",
    });
    const stateCode = checkoutRegionCode(country, state, locations);
    const savedState = Boolean(state && !regions.some((region) => region.code === state));
    const countryError = errors[kind]?.country?.message;
    const stateError = errors[kind]?.state?.message;
    const fieldClass = "min-h-11 w-full rounded-[0.62rem] border border-sf-control-border bg-sf-surface px-3 py-2 text-base text-sf-content caret-sf-content placeholder:text-sf-placeholder enabled:hover:border-sf-control-hover focus:outline-none focus:ring-2 focus:ring-sf-focus focus:ring-offset-2 focus:ring-offset-sf-surface disabled:cursor-not-allowed disabled:bg-sf-subtle disabled:text-sf-muted aria-[invalid=true]:border-sf-error aria-[invalid=true]:enabled:hover:border-sf-error";
    return (
      <div className="col-span-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${kind}.country`} className="mb-1 block text-sm font-medium text-sf-content">País *</label>
          <select {...countryRegistration} id={`${kind}.country`} autoComplete={`section-${kind} country`} className={fieldClass}
            aria-invalid={Boolean(countryError)} aria-describedby={countryError ? `${kind}.country-error` : undefined}
            disabled={locationsLoading || locationsError}
            onChange={(event) => {
              void countryRegistration.onChange(event);
              const next = checkoutLocationAfterCountryChange(country, event.target.value, state);
              setValue(`${kind}.state`, next.state, { shouldDirty: true });
              clearErrors(`${kind}.state`);
            }}>
            <option value="">{locationsLoading ? "Cargando países…" : "Selecciona un país"}</option>
            {country && !locations.countries.some((entry) => entry.code === country) && <option value={country}>{country}</option>}
            {locations.countries.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
          </select>
          {countryError && <p id={`${kind}.country-error`} className="mt-1 text-sm text-sf-error" role="alert">{countryError}</p>}
        </div>
        <div>
          <label htmlFor={`${kind}.state`} className="mb-1 block text-sm font-medium text-sf-content">Estado / región{regions.length > 0 ? " *" : ""}</label>
          {regions.length > 0 ? (
            <select {...stateRegistration} id={`${kind}.state`} autoComplete={`section-${kind} address-level1`} className={fieldClass}
              aria-invalid={Boolean(stateError)} aria-describedby={stateError ? `${kind}.state-error` : undefined}>
              <option value="">Selecciona un estado o región</option>
              {savedState && <option value={state}>{regions.find((region) => region.code === stateCode)?.name || state}</option>}
              {regions.map((region) => <option key={region.code} value={region.code}>{region.name}</option>)}
            </select>
          ) : (
            <input {...stateRegistration} id={`${kind}.state`} autoComplete={`section-${kind} address-level1`} className={fieldClass}
              placeholder={country ? "Estado o región, si corresponde" : "Selecciona primero el país"}
              disabled={!country || locationsLoading || locationsError}
              aria-invalid={Boolean(stateError)} aria-describedby={stateError ? `${kind}.state-error` : undefined} />
          )}
          {stateError && <p id={`${kind}.state-error`} className="mt-1 text-sm text-sf-error" role="alert">{stateError}</p>}
        </div>
      </div>
    );
  };

  if (showSummary && isOpen) {
    return (
      <>
        <div className="mt-4  items-start  hidden sm:flex">
          <div className="flex flex-col justify-between px-2 w-full">
            <div className="flex">
              <p className="w-[184px] text-base font-normal text-sf-muted">
                Dirección de facturación
              </p>
              <div className="block cursor-pointer rounded-xl p-2 max-sm:rounded-lg">
                <div className="flex flex-col">
                  <p className="text-base font-medium">
                    {`${billingAddress?.firstName || ""} ${billingAddress?.lastName || ""
                      }`}
                  </p>
                  <p className="text-base font-medium text-sf-muted">
                    {`${billingAddress?.companyName || ""}`}
                  </p>
                </div>
                <p className="mt-2 text-sm text-sf-muted max-md:mt-2 max-sm:mt-0">
                  {`${billingAddress?.address || ""}, ${billingAddress?.postcode || ""
                    }`}
                </p>
                <p className="text-sf-muted">
                  {billingAddress?.city || ""} {billingAddress?.state || ""},
                  {billingAddress?.country || ""}
                </p>
                <p className="mt-2 text-sm text-sf-muted max-md:mt-2 max-sm:mt-0">
                  {`T: ${billingAddress?.phone || ""}`}
                </p>
              </div>
            </div>
            <div className="flex">
              <p className="w-[184px] text-base font-normal text-sf-muted">
                Dirección de envío
              </p>
              <div className="block cursor-pointer rounded-xl p-2 max-sm:rounded-lg">
                <div className="flex flex-col">
                  <p className="text-base font-medium">
                    {`${shippingAddress?.firstName || ""} ${shippingAddress?.lastName || ""
                      }`}
                  </p>
                  <p className="text-base font-medium text-sf-muted">
                    {`${shippingAddress?.companyName || ""}`}
                  </p>
                </div>
                <p className="mt-2 text-sm text-sf-muted max-md:mt-2 max-sm:mt-0">
                  {`${shippingAddress?.address || ""}, ${shippingAddress?.postcode || ""
                    }`}
                </p>
                <p className="text-sf-muted">
                  {shippingAddress?.city || ""} {shippingAddress?.state || ""},
                  {shippingAddress?.country || ""}
                </p>
                <p className="mt-2 text-sm text-sf-muted max-md:mt-2 max-sm:mt-0">
                  {`T: ${shippingAddress?.phone || ""}`}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="cursor-pointer text-base font-normal text-sf-muted underline hover:text-sf-link-hover focus-visible:outline-2 focus-visible:outline-sf-focus focus-visible:outline-offset-2"
          >
            Cambiar
          </button>
        </div>
        <div className="mt-4 flex sm:hidden items-start justify-between relative">
          <div className="flex flex-col justify-between px-2 w-full">
            <div className="flex justify-between justify-between  flex-1 wrap">
              <p className="w-[184px] text-base font-normal text-sf-muted">
                Dirección de facturación
              </p>
              <div className="block cursor-pointer rounded-xl p-2 max-sm:rounded-lg">
                <div className="flex flex-col">
                  <p className="text-base font-medium">
                    {`${billingAddress?.firstName || ""} ${billingAddress?.lastName || ""
                      }`}
                  </p>
                  <p className="text-base font-medium text-sf-muted">
                    {`${billingAddress?.companyName || ""}`}
                  </p>
                </div>
                <p className="mt-2 text-sm text-sf-muted max-md:mt-2 max-sm:mt-0">
                  {`${billingAddress?.address || ""}, ${billingAddress?.postcode || ""
                    }`}
                </p>
                <p className="text-sf-muted">
                  {billingAddress?.city || ""} {billingAddress?.state || ""},
                  {billingAddress?.country || ""}
                </p>
                <p className="mt-2 text-sm text-sf-muted max-md:mt-2 max-sm:mt-0">
                  {`T: ${billingAddress?.phone || ""}`}
                </p>
              </div>
            </div>
            <div className="flex justify-between justify-between  flex-1 wrap">
              <p className="w-[184px] text-base font-normal text-sf-muted">
                Dirección de envío
              </p>
              <div className="block cursor-pointer rounded-xl p-2 max-sm:rounded-lg">
                <div className="flex flex-col">
                  <p className="text-base font-medium">
                    {`${shippingAddress?.firstName || ""} ${shippingAddress?.lastName || ""
                      }`}
                  </p>
                  <p className="text-base font-medium text-sf-muted">
                    {`${shippingAddress?.companyName || ""}`}
                  </p>
                </div>
                <p className="mt-2 text-sm text-sf-muted max-md:mt-2 max-sm:mt-0">
                  {`${shippingAddress?.address || ""}, ${shippingAddress?.postcode || ""
                    }`}
                </p>
                <p className="text-sf-muted">
                  {shippingAddress?.city || ""} {shippingAddress?.state || ""},
                  {shippingAddress?.country || ""}
                </p>
                <p className="mt-2 text-sm text-sf-muted max-md:mt-2 max-sm:mt-0">
                  {`T: ${shippingAddress?.phone || ""}`}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="cursor-pointer absolute right-0 text-base font-normal text-sf-muted underline hover:text-sf-link-hover focus-visible:outline-2 focus-visible:outline-sf-focus focus-visible:outline-offset-2"
            style={{ top: "-36px" }}
          >
            Cambiar
          </button>
        </div>
      </>
    );
  }

  return (
    <form className="my-5" onSubmit={handleSubmit(addGuestAddress)}>
      {locationsError && <div className="my-4 text-sm text-sf-error" role="alert">
        No pudimos cargar los países y estados. Tus datos siguen en el formulario.{" "}
        <button type="button" className="underline hover:text-sf-link-hover focus-visible:outline-2 focus-visible:outline-sf-focus focus-visible:outline-offset-2" onClick={() => { setLocationsLoading(true); setLocationsError(false); setLocationAttempt((attempt) => attempt + 1); }}>Reintentar</button>
      </div>}
      <div className="my-7 grid grid-cols-6 gap-4">
        <InputText
          {...register("billing.firstName", {
            required: "El nombre es obligatorio",
            pattern: {
              value: IS_VALID_INPUT,
              message: "Nombre inválido",
            },
          })}
          className="col-span-6 xxs:col-span-3 mb-4"
          errorMsg={errors?.billing?.firstName?.message}
          label="Nombre *"
          tone="surface"
          autoComplete="section-billing given-name"
          size="md"
        />
        <InputText
          {...register("billing.lastName", {
            required: "El apellido es obligatorio",
            pattern: {
              value: IS_VALID_INPUT,
              message: "Apellido inválido",
            },
          })}
          className="col-span-6 xxs:col-span-3 mb-4"
          errorMsg={errors?.billing?.lastName?.message}
          label="Apellido *"
          tone="surface"
          autoComplete="section-billing family-name"
          size="md"
        />
        <InputText
          {...register("billing.companyName", {
            pattern: {
              value: IS_VALID_INPUT,
              message: "Nombre de empresa inválido",
            },
          })}
          className="col-span-6 mb-2"
          errorMsg={errors?.billing?.companyName?.message}
          label="Empresa"
          tone="surface"
          autoComplete="section-billing organization"
          size="md"
        />
        <InputText
          {...register("billing.address", {
            required: "La dirección es obligatoria",
            pattern: {
              value: IS_VALID_ADDRESS,
              message: "Dirección inválida",
            },
          })}
          className="col-span-6 mb-4"
          errorMsg={errors?.billing?.address?.message}
          label="Dirección *"
          tone="surface"
          autoComplete="section-billing street-address"
          size="md"
        />
        {locationFields("billing")}
        <InputText
          {...register("billing.city", {
            required: "La ciudad es obligatoria",
            pattern: {
              value: IS_VALID_INPUT,
              message: "Ciudad inválida",
            },
          })}
          className="col-span-6 xxs:col-span-3 mb-4"
          errorMsg={errors?.billing?.city?.message}
          label="Ciudad *"
          tone="surface"
          autoComplete="section-billing address-level2"
          size="md"
        />
        <InputText
          {...register("billing.postcode", {
            required: "El código postal es obligatorio",
            pattern: {
              value: IS_VALID_INPUT,
              message: "Código postal inválido",
            },
          })}
          className="col-span-6 xxs:col-span-3"
          errorMsg={errors?.billing?.postcode?.message}
          label="Código postal *"
          tone="surface"
          autoComplete="section-billing postal-code"
          size="md"
        />
        <InputText
          {...register("billing.phone", {
            required: "El teléfono es obligatorio",
            pattern: {
              value: IS_VALID_PHONE,
              message: "Ingresa un número de teléfono válido",
            },
          })}
          type="tel"
          inputMode="tel"
          autoComplete="section-billing tel"
          className="col-span-6"
          errorMsg={errors?.billing?.phone?.message}
          label="Teléfono *"
          tone="surface"
          size="md"
        />
        <CheckBox
          className="col-span-6 mt-3"
          defaultValue={watchUseForShipping}
          id="useForShipping"
          label="¿Usar la misma dirección para envío?"
          tone="surface"
          {...register("useForShipping")}
        />
      </div>

      {!watchUseForShipping && (
        <div className="my-7 grid grid-cols-6 gap-4">
          <InputText
            {...register("shipping.firstName", {
              required: "El nombre es obligatorio",
              pattern: {
                value: IS_VALID_INPUT,
                message: "Nombre inválido",
              },
            })}
            className="col-span-3 mb-4"
            errorMsg={errors?.shipping?.firstName?.message}
            label="Nombre *"
            tone="surface"
            autoComplete="section-shipping given-name"
            size="md"
          />
          <InputText
            {...register("shipping.lastName", {
              required: "El apellido es obligatorio",
              pattern: {
                value: IS_VALID_INPUT,
                message: "Apellido inválido",
              },
            })}
            className="col-span-3 mb-4"
            errorMsg={errors?.shipping?.lastName?.message}
            label="Apellido *"
            tone="surface"
            autoComplete="section-shipping family-name"
            size="md"
          />
          <InputText
            {...register("shipping.companyName", {
              pattern: {
                value: IS_VALID_INPUT,
                message: "Nombre de empresa inválido",
              },
            })}
            className="col-span-6 mb-4"
            errorMsg={errors?.shipping?.companyName?.message}
            label="Empresa"
            tone="surface"
            autoComplete="section-shipping organization"
            size="md"
          />
          <InputText
            {...register("shipping.address", {
              required: "La dirección es obligatoria",
              pattern: {
                value: IS_VALID_ADDRESS,
                message: "Dirección inválida",
              },
            })}
            className="col-span-6 mb-4"
            errorMsg={errors?.shipping?.address?.message}
            label="Dirección *"
            tone="surface"
            autoComplete="section-shipping street-address"
            size="md"
          />
          {locationFields("shipping")}
          <InputText
            {...register("shipping.city", {
              required: "La ciudad es obligatoria",
              pattern: {
                value: IS_VALID_INPUT,
                message: "Ciudad inválida",
              },
            })}
            className="col-span-3 mb-4"
            errorMsg={errors?.shipping?.city?.message}
            label="Ciudad *"
            tone="surface"
            autoComplete="section-shipping address-level2"
            size="md"
          />
          <InputText
            {...register("shipping.postcode", {
              required: "El código postal es obligatorio",
              pattern: {
                value: IS_VALID_INPUT,
                message: "Código postal inválido",
              },
            })}
            className="col-span-3"
            errorMsg={errors?.shipping?.postcode?.message}
            label="Código postal *"
            tone="surface"
            autoComplete="section-shipping postal-code"
            size="md"
          />
          <InputText
            {...register("shipping.phone", {
              required: "El teléfono es obligatorio",
              pattern: {
                value: IS_VALID_PHONE,
                message: "Ingresa un número de teléfono válido",
              },
            })}
            className="col-span-6"
            errorMsg={errors?.shipping?.phone?.message}
            label="Teléfono *"
            tone="surface"
            typeName="tel"
            inputMode="tel"
            autoComplete="section-shipping tel"
            size="md"
          />
        </div>
      )}

      <div className="justify-self-end">
        <ProceedToCheckout buttonName="Siguiente" pending={isSubmitting || isLoadingToSave || locationsLoading || locationsError} />
      </div>
    </form>
  );
};
