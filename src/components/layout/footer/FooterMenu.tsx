import Link from "next/link";
import { ThemeOptions } from "@/types/types";
import { FooterColumns, ThemeCustomizationNode } from "@/types/theme/theme-customization";
import { isArray } from "@/utils/type-guards";
import { safeParse } from "@/utils/helper";
import { pickTranslationByLocale } from "@/utils/theme-translation";
import { getStorefrontLocaleCode } from "@/utils/server/storefront-locale";
import type { NextFooterSettings } from "@/lib/storefront-experience/document";

const getUrlparams = (url?: string | null) => {
  if (!url) return "/";
  const splitUrl = url.split("/");

  if (isArray(splitUrl)) {
    const urlLength = splitUrl.length;

    if (urlLength >= 1) {
      return `/${splitUrl.at(urlLength - 1)}`;
    }
  }

  return "/";
};

const FooterMenuItem = ({ item, explicitUrl = false }: { item: ThemeOptions; explicitUrl?: boolean }) => {
  return (
    <li className="text-selected-black dark:text-neutral-300">
      <Link
        aria-label={`${item?.title}`}
        title={`${item?.title}`}
        className={`block px-0 py-1 md:p-2 ${explicitUrl ? "break-words whitespace-normal" : "text-nowrap"} text-sm underline-offset-4 text-selected-black dark:text-neutral-300 hover:text-black hover:underline md:inline-block dark:hover:text-neutral-300`}
        href={explicitUrl ? item.url || "/" : getUrlparams(item.url)}
      >
        {item.title}
      </Link>
    </li>
  );
};

export default async function FooterMenu({
  menu,
  editorial,
}: {
  menu: ThemeCustomizationNode[];
  editorial?: NextFooterSettings["columns"];
}) {
  if (!editorial && (!menu || menu.length === 0)) return null;

  const localeCode = await getStorefrontLocaleCode();

  const firstMenu = menu[0];
  const translations = firstMenu?.translations || [];
  const firstTranslation = pickTranslationByLocale(translations, localeCode);
  const channels =
    typeof firstTranslation?.options === "string"
      ? safeParse(firstTranslation.options)
      : firstTranslation?.options;
  const columns = editorial ?? (
    channels && typeof channels === "object" ? (channels as FooterColumns) : null
  );

  return (
    <div className="flex justify-between gap-x-8 lg:gap-x-[50px]">
      {/* Render columns 1 */}
      {isArray(columns?.column_1) ? (
        <nav className="w-full lg:min-w-[160px] xl:min-w-[200px]">
          <ul>
            {(columns?.column_1 || []).map((item: ThemeOptions, index: number) => {
              return <FooterMenuItem key={index} item={item} explicitUrl={Boolean(editorial)} />;
            })}
          </ul>
        </nav>
      ) : null}

      {/* Render columns 2 */}
      {isArray(columns?.column_2) ? (
        <nav className="w-full lg:min-w-[160px] xl:min-w-[200px]">
          <ul>
            {(columns?.column_2 || []).map((item: ThemeOptions, index: number) => {
              return <FooterMenuItem key={index} item={item} explicitUrl={Boolean(editorial)} />;
            })}
          </ul>
        </nav>
      ) : null}

      {/* Render columns 3 */}
      {isArray(columns?.column_3) ? (
        <nav className="w-full lg:min-w-[160px] xl:min-w-[200px]">
          <ul>
            {(columns?.column_3 || []).map((item: ThemeOptions, index: number) => {
              return <FooterMenuItem key={index} item={item} explicitUrl={Boolean(editorial)} />;
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
