import Image from "next/image";
import { unstable_rethrow } from "next/navigation";
import StorefrontLink from "@/components/common/StorefrontLink";
import { isCentralExperienceHost } from "@/lib/storefront-experience/runtime";
import { clientContextHost, optionalRequestHeaders } from "@/utils/server/client-context";
import { getStorefrontDefaultChannel } from "@/utils/server/storefront-default-channel";
import GlobalNotFound from "../not-found";

const ASSETS = "/storefront-closed";
const TITLE = "No encontramos esta página";

async function storefrontChannel() {
  const incoming = await optionalRequestHeaders();
  if (!incoming) return null;

  try {
    if (isCentralExperienceHost(clientContextHost(incoming))) return null;
    return await getStorefrontDefaultChannel();
  } catch (error) {
    // Next's render/route control flow must reach its own boundary.
    unstable_rethrow(error);
    return null;
  }
}

export default async function NotFound() {
  const channel = await storefrontChannel();
  if (!channel) return <GlobalNotFound />;

  const name = typeof channel.name === "string" ? channel.name.trim() : "";
  const initial = Array.from(name)[0]?.toLocaleUpperCase("es");

  return (
    <section data-storefront-v3-not-found aria-labelledby="storefront-v3-not-found-title">
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
              <i className="ph-duotone ph-compass text-[28px]" aria-hidden="true">
                <Image src={`${ASSETS}/compass-duotone.svg`} alt="" width={28} height={28} unoptimized />
              </i>
            </span>
            <h1 id="storefront-v3-not-found-title" className="t-seccion mt-4">{TITLE}</h1>
            <p className="mt-2 text-sm text-base-content/70">
              Puede que el producto ya no esté o que el enlace esté mal escrito.
            </p>
            <div className="mt-5 space-y-2">
              <StorefrontLink className="btn btn-accent w-full" href="/" prefetch={false}>
                <i className="ph-bold ph-storefront text-base" aria-hidden="true">
                  <Image src={`${ASSETS}/storefront-bold.svg`} alt="" width={16} height={16} unoptimized />
                </i>
                Ver la tienda
              </StorefrontLink>
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
