import { ExclamationCircleIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { forwardRef } from "react";
import { isArray } from '@/utils/type-guards';
interface InputTextProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  className?: string;
  label: string;
  name: string;
  errorMsg?: string | string[] | Record<string, unknown>;
  defaultValue?: string;
  typeName?: string;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  labelPlacement?: "inside" | "outside" | "outside-left";
  rounded?: "sm" | "md" | "lg";
  showAsterisk?: boolean; // Show asterisk if true
  tone?: "default" | "surface";
}

const sizeClasses = {
  sm: "text-sm px-2 py-1",
  md: "text-base px-3 py-2",
  lg: "text-lg px-4 py-3",
};

const roundedClasses = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
};

const InputText = forwardRef<HTMLInputElement, InputTextProps>(
  (
    {
      className,
      label,
      name,
      id = name,
      errorMsg,
      defaultValue,
      typeName = "text",
      placeholder,
      size = "sm",
      labelPlacement = "inside",
      rounded = "sm",
      required,
      showAsterisk = true,
      tone = "default",
      ...rest
    },
    ref
  ) => {
    const hasError = Boolean(errorMsg);
    const errorId = `${id}-error`;
    const surface = tone === "surface";
    const describedBy = [rest["aria-describedby"], hasError ? errorId : undefined].filter(Boolean).join(" ") || undefined;

    const borderColorClass = hasError
      ? surface ? "border-sf-error" : "border-red-500"
      : surface ? "border-sf-control-border enabled:hover:border-sf-control-hover" : "border-gray-300 dark:border-gray-500";

    return (
      <div className={clsx("max-w-full mb-2.5", className)}>
        {labelPlacement === "inside" ? (
          <label className="sr-only" htmlFor={id}>{label}</label>
        ) : (
          <label
            className={clsx(
              "px-1 mb-1 block font-medium",
              surface ? "text-sf-content" : "text-black dark:text-white"
            )}
            htmlFor={id}
          >
            {label} {showAsterisk && <span className="text-red-500">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            className={clsx(
              "w-full !rounded-[0.62rem] border",
              surface
                ? "bg-sf-surface text-sf-content caret-sf-content placeholder:text-sf-placeholder focus:outline-none focus:ring-2 focus:ring-sf-focus focus:ring-offset-2 focus:ring-offset-sf-surface disabled:cursor-not-allowed disabled:bg-sf-subtle disabled:text-sf-muted"
                : "bg-transparent text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white",
              borderColorClass,
              sizeClasses[size],
              roundedClasses[rounded],
              labelPlacement === "inside" && !surface
                ? "placeholder-input-color dark:placeholder-selected-color-dark"
                : ""
            )}
            defaultValue={defaultValue}
            id={id}
            name={name}
            placeholder={labelPlacement === "inside" ? label : placeholder}
            type={typeName}
            required={required}
            {...rest}
            aria-invalid={hasError || rest["aria-invalid"] || undefined}
            aria-describedby={describedBy}
          />
          {hasError && (
            <ul id={errorId} role="alert" className={clsx("absolute -bottom-8 py-2 text-sm", surface ? "text-sf-error" : "text-red-500")}>
              {isArray(errorMsg) ? (
                (errorMsg as string[]).map((msg, index) => (
                  <li key={index} className="flex items-center gap-1">
                    <ExclamationCircleIcon className="h-5 w-5" />
                    {msg}
                  </li>
                ))
              ) : (
                <li className="flex items-center gap-1 text-xs sm:text-sm">
                  <ExclamationCircleIcon className="size-[18px]" />
                  {typeof errorMsg === "string"
                    ? errorMsg
                    : JSON.stringify(errorMsg)}
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    );
  }
);

InputText.displayName = "InputText";

export default InputText;
