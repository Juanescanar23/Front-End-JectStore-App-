"use client";

import Image from "next/image";
import Link from "next/link";
import { SubmitHandler, useForm } from "react-hook-form";
import InputText from "@components/common/form/Input";
import { useCustomToast } from "@/utils/hooks/useToast";
import { useRouter } from "next/navigation";
import { EMAIL_REGEX, SIGNUP_IMG, IS_VALID_INPUT } from "@utils/constants";
import { createUser } from "@utils/actions";
import { Button } from "@components/common/button/Button";

export type RegisterInputs = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

export default function RegistrationForm() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInputs>({
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const { showToast } = useCustomToast();

  const onSubmit: SubmitHandler<RegisterInputs> = async (data) => {
    if (data.password !== data.passwordConfirmation) {
      showToast("Las contraseñas no coinciden.", "warning");
      return;
    }

    await createUser(data)
      .then((res) => {
        if (res?.success) {
          showToast("Usuario creado correctamente", "success");
          router.replace("/customer/login");
        } else {
          showToast(res?.error?.message || "No se pudo crear el usuario", "warning");
        }
      })
      .catch((error) => {
        showToast(error.message || "Ocurrió un error", "warning");
      });
  };

  return (
    <div className="mt-5 md:my-8 md:mt-0 flex w-full items-center w-full max-w-screen-2xl mx-auto px-4 xss:px-7.5 justify-between gap-0 md:gap-4 lg:my-16 xl:my-28">
      <div className="relative flex w-full max-w-[583px] flex-col gap-y-4 lg:gap-y-12">
        <div className="font-outfit">
          <h2 className="py-1 text-2xl font-semibold sm:text-4xl">
            Crea tu cuenta
          </h2>
          <p className="mt-2 text-base md:text-lg font-normal text-black/[60%] dark:text-neutral-400 sm:mt-2">
            Si eres nuevo en nuestra tienda, nos alegra tenerte como miembro.
          </p>
        </div>

        <form
          noValidate
          className="flex flex-col gap-y-5 lg:gap-y-12"
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="flex flex-col gap-y-2.5 lg:gap-[18px]">
            <div className="flex w-full gap-2.5 lg:gap-[18px]">
              <InputText
                {...register("firstName", {
                  required: "El nombre es obligatorio",
                  pattern: {
                    value: IS_VALID_INPUT,
                    message: "Nombre inválido",
                  },
                })}
                className="w-full"
                errorMsg={
                  errors.firstName?.message
                    ? [errors.firstName.message]
                    : undefined
                }
                label="Nombre"
                labelPlacement="outside"
                name="firstName"
                placeholder="Ingresa tu nombre"
                size="lg"
              />
              <InputText
                {...register("lastName",
                  {
                    required: "El apellido es obligatorio",
                    pattern: {
                      value: IS_VALID_INPUT,
                      message: "Apellido inválido",
                    },
                  })}
                className="w-full"
                errorMsg={
                  errors.lastName?.message
                    ? [errors.lastName.message]
                    : undefined
                }
                label="Apellido"
                labelPlacement="outside"
                name="lastName"
                placeholder="Ingresa tu apellido"
                size="lg"
              />
            </div>

            <InputText
              {...register("email", {
                required: "El correo es obligatorio",
                pattern: {
                  value: EMAIL_REGEX,
                  message: "Ingresa un correo válido.",
                },
              })}
              errorMsg={errors.email?.message}
              label="Correo electrónico"
              labelPlacement="outside"
              name="email"
              placeholder="Ingresa tu correo electrónico"
              size="lg"
            />

            <InputText
              {...register("password", {
                required: "La contraseña es obligatoria",
                minLength: {
                  value: 8,
                  message: "Debe tener al menos 8 caracteres",
                },
                validate: (val) => {
                  if (!/[A-Z]/.test(val))
                    return "Debe contener al menos una mayúscula";
                  if (!/[a-z]/.test(val))
                    return "Debe contener al menos una minúscula";
                  if (!/[0-9]/.test(val))
                    return "Debe contener al menos un número";
                  if (/\s/.test(val)) return "No puede contener espacios";

                  return true;
                },
              })}
              label="Contraseña"
              labelPlacement="outside"
              name="password"
              placeholder="Ingresa tu contraseña"
              typeName="password"
              size="lg"
              errorMsg={
                errors.password?.message ? [errors.password.message] : undefined
              }
            />

            <InputText
              {...register("passwordConfirmation", {
                required: "Confirma tu contraseña",
              })}
              label="Confirmar contraseña"
              labelPlacement="outside"
              name="passwordConfirmation"
              placeholder="Confirma tu contraseña"
              size="lg"
              typeName="password"
            />
          </div>

          <div className="flex flex-col gap-y-3 mb-8 lg:mb-0">
            <Button
              disabled={isSubmitting}
              loading={isSubmitting}
              title="Registrarse"
              type="submit"
            />
            <span className="mx-auto md:mx-0 font-outfit">
              ¿Ya tienes cuenta?{" "}
              <Link className="text-blue-600 underline" href="/customer/login" aria-label="Ir a iniciar sesión">
                Iniciar sesión
              </Link>
            </span>
          </div>
        </form>
      </div>

      <div className="relative hidden aspect-[0.9] max-h-[692px] w-full max-w-[790px] sm:block md:aspect-[1.14]">
        <Image
          fill
          priority
          alt="Imagen de registro"
          className="h-full w-full object-cover transition duration-300 ease-in-out group-hover:scale-105"
          sizes="(min-width: 768px) 66vw, 100vw"
          src={SIGNUP_IMG}
        />
      </div>
    </div>
  );
}
