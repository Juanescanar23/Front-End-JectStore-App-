"use client";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { EMAIL, getLocalStorage, setLocalStorage } from "@/store/local-storage";
import Link from "next/link";
import InputText from "@components/common/form/Input";
import { ProceedToCheckout } from "./ProceedToCheckout";
import { updateCheckoutStep } from "@/utils/checkout-step";
import { EmailFormProps, EmailFormValues } from "../type";
import { EMAIL_REGEX } from "@utils/constants";



const Email = ({ isCurrentStep }: { isCurrentStep: boolean }) => {
  const email = getLocalStorage(EMAIL);
  const [isOpen, setIsOpen] = useState(false);
  const isGuest = true;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailFormValues>({
    defaultValues: { email },
  });

  const onSubmit = (data: EmailFormValues) => {
    setLocalStorage(EMAIL, data?.email);
    setIsOpen(false);
    updateCheckoutStep("address", "push");
  };

  return (
    <>
      {isCurrentStep || email === "" || typeof email === "object" || isOpen ? (
        <form className="mt-5" noValidate onSubmit={handleSubmit(onSubmit)}>
          <EmailForm
            register={register}
            errors={errors}
            isSubmitting={isSubmitting}
            isGuest={isGuest}
          />
        </form>
      ) : (
        <>
          <div className="mt-4  justify-between hidden sm:flex">
            <div className="flex">
              <p className="w-auto text-base font-normal text-sf-muted sm:w-[192px]">
                Correo electrónico
              </p>
              <p className="font-normal block text-base text-sf-muted">{email}</p>
            </div>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="cursor-pointer text-base font-normal text-sf-muted underline hover:text-sf-link-hover focus-visible:outline-2 focus-visible:outline-sf-focus focus-visible:outline-offset-2"
            >
              Cambiar
            </button>
          </div>
          <div className=" relative mt-4 flex sm:hidden flex-col justify-end gap-y-2 sm:flex-row sm:justify-between sm:gap-y-0">
            <div className="flex justify-between  flex-1 flex-wrap">
              <p className="w-auto text-base font-normal text-sf-muted sm:w-[192px]">
                Correo electrónico
              </p>
              <p className="font-normal block text-base text-sf-muted">{email}</p>
            </div>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="cursor-pointer absolute right-0  text-base font-normal text-sf-muted underline hover:text-sf-link-hover focus-visible:outline-2 focus-visible:outline-sf-focus focus-visible:outline-offset-2"
              style={{ top: "-36px" }}
            >
              Cambiar
            </button>
          </div>
        </>
      )}
    </>
  );
};

export default Email;

function EmailForm({
  register,
  errors,
  isSubmitting,
  isGuest,
}: EmailFormProps) {
  return (
    <div>
      <InputText
        className="max-w-full"
        id="email"
        tone="surface"
        typeName="email"
        autoComplete="email"
        size="md"
        {...register("email", {
          required: "El correo es obligatorio",
          pattern: {
            value: EMAIL_REGEX,
            message: "Ingresa un correo válido",
          }
        })}
        errorMsg={errors?.email?.message as string}
        label="Ingresa correo *"
        placeholder="ejemplo@correo.com"
        readOnly={!isGuest}
      />

      {isGuest && (
        <p className="mb-4 mt-6 font-outfit text-base font-normal text-sf-muted">
          ¿Ya tienes cuenta? No pasa nada, solo{" "}
          <br className="block sm:hidden" />
          <Link
            aria-label="Ir a iniciar sesión"
            className="text-base font-normal text-sf-link hover:text-sf-link-hover focus-visible:outline-2 focus-visible:outline-sf-focus focus-visible:outline-offset-2"
            href="/customer/login"
          >
            inicia sesión.
          </Link>
        </p>
      )}

      <div className="mt-6 justify-self-end">
        <ProceedToCheckout buttonName="Siguiente" pending={isSubmitting} />
      </div>
    </div>
  );
}
