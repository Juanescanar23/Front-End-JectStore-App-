"use client";
import LoadingDots from "@components/common/icons/LoadingDots";
import clsx from "clsx";
import { useFormStatus } from "react-dom";



function SubmitButton({
  availableForSale,
  buttonName,
  className,
}: {
  availableForSale: boolean;
  buttonName: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const busy = pending || !availableForSale;
  const buttonClasses =
    "relative text-base w-fit cursor-pointer rounded-full px-8 py-3 font-bold border-white items-center justify-center bg-sf-action tracking-wide text-sf-action-content enabled:hover:bg-sf-action-hover enabled:active:bg-sf-action-active focus-visible:outline-2 focus-visible:outline-sf-focus focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60";

  return (
    <button
      type="submit"
      disabled={busy}
      aria-disabled={busy}
      aria-busy={busy}
      aria-label={buttonName}
      className={clsx(
        buttonClasses,
        className,
      )}
    >
      <div className="absolute left-0 ml-4">
        {pending && <LoadingDots className="mb-3 bg-white" />}
      </div>
      {!availableForSale ? "Procesando..." : buttonName}
    </button>
  );
}

export function ProceedToCheckout({
  buttonName,
  className,
  pending = false,
}: {
  buttonName: string;
  className?: string;
  pending: boolean;
}) {
  return (
    <SubmitButton
      availableForSale={!pending}
      buttonName={buttonName}
      className={className}
    />
  );
}
