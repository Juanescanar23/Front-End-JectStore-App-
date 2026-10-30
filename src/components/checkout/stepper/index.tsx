import Link from "next/link";
import { useMemo } from "react";
import LogoIcon from "@components/common/icons/LogoIcon";
import Email from "./Email";
import { GuestAddAdressForm } from "./GuestAddAdressForm";
import Shipping from "./shipping";
import Payment from "./payment";
import Review from "./review";



const { SITE_NAME } = process.env;

interface Step {
  id: number;
  key: string;
  title: string;
  href: string;
  component: React.ReactNode;
}

interface CheckOutProps {
  billingAddress?: any;
  shippingAddress?: any;
  currentStep: string;
  selectedPayment?: any;
  selectedPaymentTitle?: string;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  selectedShippingRate?: any;
  selectedShippingRateTitle?: string;
}

// Stable component identity keeps completed step forms/summaries mounted while cart data refreshes.
function StepItem({ step, currentStep, currentStepId }: { step: Step; currentStep: string; currentStepId: number }) {
  const isActive = step.key === currentStep;
  const isCompleted = step.id <= currentStepId;

  return (
    <div
      className="rounded-[26px] border border-sf-border bg-sf-surface/80 p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-center justify-between font-outfit">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
              isCompleted
                ? "bg-sf-action text-sf-action-content"
                : "bg-sf-subtle text-sf-content"
            }`}
          >
            {step.id}
          </div>
          <span
            className={`text-lg font-medium max-md:text-base ${
              isActive
                ? "text-sf-content"
                : "text-sf-muted"
            }`}
          >
            {step.title}
          </span>
        </div>
      </div>

      {isCompleted ? (
        <section className="relative mt-5 border-t border-sf-border pt-5">
          {step.component}
        </section>
      ) : null}
    </div>
  );
}

export default function Stepper(
  {
    billingAddress,
    shippingAddress,
    selectedShippingRate,
    selectedShippingRateTitle,
    selectedPayment,
    selectedPaymentTitle,
    currentStep,
    isOpen,
    setIsOpen
  }: CheckOutProps
) {

  const steps = useMemo<Step[]>(() => {
    return [
      {
        id: 1,
        key: "email",
        title: "Correo",
        href: "/checkout",
        component: <Email />,
      },
      {
        id: 2,
        key: "address",
        title: "Dirección",
        href: "/checkout",
        component:
          <GuestAddAdressForm
            billingAddress={billingAddress}
            shippingAddress={shippingAddress}
          />
      },
      {
        id: 3,
        key: "shipping",
        title: "Envío",
        href: "/checkout?step=address",
        component: <Shipping
          selectedShippingRate={selectedShippingRate}
        />,
      },
      {
        id: 4,
        key: "payment",
        title: "Pago",
        href: "/checkout?step=shipping",
        component: (
          <Payment
            selectedPayment={selectedPayment}
            isOpen={isOpen}
            setIsOpen={setIsOpen}
          />
        ),
      },
      {
        id: 5,
        key: "review",
        title: "Revisión",
        href: "/checkout?step=payment",
        component: (
          <Review
            billingAddress={billingAddress}
            selectedPaymentTitle={selectedPaymentTitle}
            selectedShippingRate={selectedShippingRate}
            selectedShippingRateTitle={selectedShippingRateTitle}
            shippingAddress={shippingAddress}
          />
        ),
      },
    ];
  }, [
    billingAddress,
    shippingAddress,
    selectedShippingRate,
    selectedPayment,
    selectedPaymentTitle,
    selectedShippingRateTitle,
    isOpen,
    setIsOpen
  ]);

  const currentStepIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="mx-auto w-full">
      <header className="pb-6">
        <Link
          aria-label={SITE_NAME}
          className="hidden items-center gap-2 text-sf-content md:pt-1 lg:flex"
          href="/"
        >
          <LogoIcon />
        </Link>

        <div className="mt-3 rounded-[26px] bg-sf-subtle px-4 py-5 sm:px-5 lg:px-0 lg:py-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sf-muted">
                Checkout
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-sf-content sm:text-3xl">
                Finaliza tu compra
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-sf-muted">
                Completa tus datos de contacto, envío y pago. Puedes retomar
                el paso actual sin perder el progreso.
              </p>
            </div>

            <div className="inline-flex w-fit items-center rounded-full bg-sf-surface px-3 py-1.5 text-xs font-semibold text-sf-muted shadow-sm">
              Paso {Math.max(currentStepIndex + 1, 1)} de {steps.length}
            </div>
          </div>
        </div>
      </header>

      <div className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-400 h-[calc(100dvh-260px)] overflow-y-auto pr-1 lg:h-[calc(100dvh-190px)]">
        <div className="flex h-full flex-col gap-y-5 px-0 sm:px-1">
          {steps.map((step) => (
            <StepItem key={step.id} step={step} currentStep={currentStep} currentStepId={steps[currentStepIndex]?.id || 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
