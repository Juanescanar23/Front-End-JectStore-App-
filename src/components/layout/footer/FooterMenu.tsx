import Link from "next/link";
import { ThemeOptions } from "@/types/types";
import { ThemeCustomizationNode } from "@/types/theme/theme-customization";
import { isArray } from "@/utils/type-guards";
import { safeParse } from "@/utils/helper";

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

const FooterMenuItem = ({ item }: { item: ThemeOptions }) => {
  return (
    <li className="text-selected-black dark:text-neutral-300">
      <Link
        aria-label={`${item?.title}`}
        title={`${item?.title}`}
        className="block px-0 py-1 md:p-2 text-nowrap text-sm underline-offset-4 text-selected-black dark:text-neutral-300 hover:text-black hover:underline md:inline-block dark:hover:text-neutral-300"
        href={getUrlparams(item.url)}
      >
        {item.title}
      </Link>
    </li>
  );
};

export default function FooterMenu({
  menu,
}: {
  menu: ThemeCustomizationNode[];
}) {
  if (!menu || menu.length === 0) return null;

  const firstMenu = menu[0];
  const translations = firstMenu?.translations || [];
  const firstTranslation =
    translations.find((t: any) => t.localeCode === "en") || translations[0];
  const channels =
    typeof firstTranslation?.options === "string"
      ? safeParse(firstTranslation.options)
      : firstTranslation?.options;

  return (
    <div className="flex justify-between gap-x-8 lg:gap-x-[50px]">
      {/* Render columns 1 */}
      {isArray(channels?.column_1) ? (
        <nav className="w-full lg:min-w-[160px] xl:min-w-[200px]">
          <ul>
            {channels.column_1.map((item: ThemeOptions, index: number) => {
              return <FooterMenuItem key={index} item={item} />;
            })}
          </ul>
        </nav>
      ) : null}

      {/* Render columns 2 */}
      {isArray(channels?.column_2) ? (
        <nav className="w-full lg:min-w-[160px] xl:min-w-[200px]">
          <ul>
            {channels.column_2.map((item: ThemeOptions, index: number) => {
              return <FooterMenuItem key={index} item={item} />;
            })}
          </ul>
        </nav>
      ) : null}

      {/* Render columns 3 */}
      {isArray(channels?.column_3) ? (
        <nav className="w-full lg:min-w-[160px] xl:min-w-[200px]">
          <ul>
            {channels.column_3.map((item: ThemeOptions, index: number) => {
              return <FooterMenuItem key={index} item={item} />;
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
