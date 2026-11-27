"use client";

import Image from "next/image";
import { useContext } from "react";
import { StorefrontErrorNameContext } from "./error-context";

const ASSETS = "/storefront-closed";

export default function Error({ reset, retry }: { reset: () => void; retry?: () => void }) {
  const name = useContext(StorefrontErrorNameContext);
  const initial = name ? Array.from(name)[0]?.toLocaleUpperCase("es") : null;

  return (
    <section data-storefront-v3-error aria-labelledby="storefront-v3-error-title">
      <link rel="stylesheet" href={`${ASSETS}/not-found.css`} precedence="default" />
      <div className="flex min-h-[calc(100vh-40px)] items-center justify-center px-4 py-10">
        <div className="w-full min-w-0 max-w-sm lg:max-w-md">
          {name ? (
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-neutral text-xs font-bold text-neutral-content">
                  {initial}
                </span>
                <span data-storefront-name>{name}</span>
              </span>
            </div>
          ) : null}
          <div className="caja mt-6 p-6 sm:p-8 lg:p-10">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-base-200">
              <i className="ph-duotone ph-wrench text-[28px]" aria-hidden="true">
                <Image src={`${ASSETS}/wrench-duotone.svg`} alt="" width={28} height={28} unoptimized />
              </i>
            </span>
            <h1 id="storefront-v3-error-title" className="t-seccion mt-4">Algo falló al cargar</h1>
            <p className="mt-2 text-sm text-base-content/70">
              No pudimos mostrar esta página. Lo que tenías en el carrito sigue ahí.
            </p>
            <div className="mt-5 space-y-2">
              <button className="btn btn-accent w-full" type="button" onClick={retry ?? reset}>
                <i className="ph-bold ph-arrow-clockwise text-base" aria-hidden="true">
                  <Image src={`${ASSETS}/arrow-clockwise-bold.svg`} alt="" width={16} height={16} unoptimized />
                </i>
                Intentar otra vez
              </button>
            </div>
          </div>
          <p className="t-nota mt-6 text-center">
            Tienda hecha con{" "}
            <a className="underline underline-offset-4" href="https://jectstore.com/" target="_blank" rel="noopener noreferrer">
              JectStore
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
