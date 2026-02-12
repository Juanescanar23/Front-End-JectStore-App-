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

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    mode: "onSubmit",
    defaultValues: {
      billing: {
        email: billingAddress?.email ?? email ?? "",
        firstName: billingAddress?.firstName || "",
        lastName: billingAddress?.lastName || "",
        companyName: billingAddress?.companyName || "",
        address: billingAddress?.address || "",
        country: billingAddress?.country || "IN",
        state: billingAddress?.state || "UP",
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
        country: shippingAddress?.country || "IN",
        state: shippingAddress?.state || "UP",
        city: shippingAddress?.city || "",
        postcode: shippingAddress?.postcode || "",
        phone: shippingAddress?.phone || "",
      },
      useForShipping: true,
    },
  });

  useEffect(() => {
    if (initialBilling || initialShipping) {
      const billing = initialBilling ?? null;
      const shipping = initialShipping ?? null;
      requestAnimationFrame(() => {
        setBillingAddress(billing);
        setShippingAddress(shipping);
      });

      reset({
        billing: {
          email: initialBilling?.email ?? email ?? "",
          firstName: initialBilling?.firstName || "",
          lastName: initialBilling?.lastName || "",
          companyName: initialBilling?.companyName || "",
          address: initialBilling?.address || "",
          country: initialBilling?.country || "IN",
          state: initialBilling?.state || "UP",
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
          country: initialShipping?.country || "IN",
          state: initialShipping?.state || "UP",
          city: initialShipping?.city || "",
          postcode: initialShipping?.postcode || "",
          phone: initialShipping?.phone || "",
        },
        useForShipping: true,
      });
    }
  }, [initialBilling, initialShipping, reset, email]);

  const { isLoadingToSave, saveCheckoutAddress } = useCheckout();

  const watchUseForShipping = useWatch({
    control,
    name: "useForShipping",
    defaultValue: true,
  });

  const addGuestAddress = async (data: any) => {
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
      billingCountry: billing.country || "IN",
      billingState: billing.state || "UP",
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
      payload.shippingCountry = shipping.country;
      payload.shippingState = shipping.state;
      payload.shippingPostcode = shipping.postcode;
      payload.shippingPhoneNumber = shipping.phone;
      payload.shippingCompanyName = shipping.companyName;
    }

    try {
      await saveCheckoutAddress(payload as any);
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

  if (showSummary && isOpen) {
    return (
      <>
        <div className="mt-4  items-start  hidden sm:flex">
          <div className="flex flex-col justify-between px-2 w-full">
            <div className="flex">
              <p className="w-[184px] text-base font-normal text-black/60 dark:text-white/60">
                Dirección de facturación
              </p>
              <div className="block cursor-pointer rounded-xl p-2 max-sm:rounded-lg">
                <div className="flex flex-col">
                  <p className="text-base font-medium">
                    {`${billingAddress?.firstName || ""} ${billingAddress?.lastName || ""
                      }`}
                  </p>
                  <p className="text-base font-medium text-zinc-500">
                    {`${billingAddress?.companyName || ""}`}
                  </p>
                </div>
                <p className="mt-2 text-sm text-zinc-500 max-md:mt-2 max-sm:mt-0">
                  {`${billingAddress?.address || ""}, ${billingAddress?.postcode || ""
                    }`}
                </p>
                <p className="text-zinc-500">
                  {billingAddress?.city || ""} {billingAddress?.state || ""},
                  {billingAddress?.country || ""}
                </p>
                <p className="mt-2 text-sm text-zinc-500 max-md:mt-2 max-sm:mt-0">
                  {`T: ${billingAddress?.phone || ""}`}
                </p>
              </div>
            </div>
            <div className="flex">
              <p className="w-[184px] text-base font-normal text-black/60 dark:text-white/60">
                Dirección de envío
              </p>
              <div className="block cursor-pointer rounded-xl p-2 max-sm:rounded-lg">
                <div className="flex flex-col">
                  <p className="text-base font-medium">
                    {`${shippingAddress?.firstName || ""} ${shippingAddress?.lastName || ""
                      }`}
                  </p>
                  <p className="text-base font-medium text-zinc-500">
                    {`${shippingAddress?.companyName || ""}`}
                  </p>
                </div>
                <p className="mt-2 text-sm text-zinc-500 max-md:mt-2 max-sm:mt-0">
                  {`${shippingAddress?.address || ""}, ${shippingAddress?.postcode || ""
                    }`}
                </p>
                <p className="text-zinc-500">
                  {shippingAddress?.city || ""} {shippingAddress?.state || ""},
                  {shippingAddress?.country || ""}
                </p>
                <p className="mt-2 text-sm text-zinc-500 max-md:mt-2 max-sm:mt-0">
                  {`T: ${shippingAddress?.phone || ""}`}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="cursor-pointer text-base font-normal text-black/[60%] underline dark:text-neutral-300"
          >
            Cambiar
          </button>
        </div>
        <div className="mt-4 flex sm:hidden items-start justify-between relative">
          <div className="flex flex-col justify-between px-2 w-full">
            <div className="flex justify-between justify-between  flex-1 wrap">
              <p className="w-[184px] text-base font-normal text-black/60 dark:text-white/60">
                Dirección de facturación
              </p>
              <div className="block cursor-pointer rounded-xl p-2 max-sm:rounded-lg">
                <div className="flex flex-col">
                  <p className="text-base font-medium">
                    {`${billingAddress?.firstName || ""} ${billingAddress?.lastName || ""
                      }`}
                  </p>
                  <p className="text-base font-medium text-zinc-500">
                    {`${billingAddress?.companyName || ""}`}
                  </p>
                </div>
                <p className="mt-2 text-sm text-zinc-500 max-md:mt-2 max-sm:mt-0">
                  {`${billingAddress?.address || ""}, ${billingAddress?.postcode || ""
                    }`}
                </p>
                <p className="text-zinc-500">
                  {billingAddress?.city || ""} {billingAddress?.state || ""},
                  {billingAddress?.country || ""}
                </p>
                <p className="mt-2 text-sm text-zinc-500 max-md:mt-2 max-sm:mt-0">
                  {`T: ${billingAddress?.phone || ""}`}
                </p>
              </div>
            </div>
            <div className="flex justify-between justify-between  flex-1 wrap">
              <p className="w-[184px] text-base font-normal text-black/60 dark:text-white/60">
                Dirección de envío
              </p>
              <div className="block cursor-pointer rounded-xl p-2 max-sm:rounded-lg">
                <div className="flex flex-col">
                  <p className="text-base font-medium">
                    {`${shippingAddress?.firstName || ""} ${shippingAddress?.lastName || ""
                      }`}
                  </p>
                  <p className="text-base font-medium text-zinc-500">
                    {`${shippingAddress?.companyName || ""}`}
                  </p>
                </div>
                <p className="mt-2 text-sm text-zinc-500 max-md:mt-2 max-sm:mt-0">
                  {`${shippingAddress?.address || ""}, ${shippingAddress?.postcode || ""
                    }`}
                </p>
                <p className="text-zinc-500">
                  {shippingAddress?.city || ""} {shippingAddress?.state || ""},
                  {shippingAddress?.country || ""}
                </p>
                <p className="mt-2 text-sm text-zinc-500 max-md:mt-2 max-sm:mt-0">
                  {`T: ${shippingAddress?.phone || ""}`}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="cursor-pointer absolute right-0 text-base font-normal text-black/[60%] underline dark:text-neutral-300"
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
          size="md"
        />
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
          autoComplete="tel"
          className="col-span-6"
          errorMsg={errors?.billing?.phone?.message}
          label="Teléfono *"
          size="md"
        />
        <CheckBox
          className="col-span-6 mt-3"
          defaultValue={watchUseForShipping}
          id="useForShipping"
          label="¿Usar la misma dirección para envío?"
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
            size="md"
          />
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
            size="md"
          />
        </div>
      )}

      <div className="justify-self-end">
        <ProceedToCheckout buttonName="Siguiente" pending={isLoadingToSave} />
      </div>
    </form>
  );
};
