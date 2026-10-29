import Link from "next/link";
import { Suspense } from "react";
import MobileMenu from "./MobileMenu";
import Search from "./Search";
import Cart from "@/components/cart";
import { SearchSkeleton } from "@/components/common/skeleton/SearchSkeleton";
import { IconSkeleton } from "@/components/common/skeleton/IconSkeleton";
import { GET_TREE_CATEGORIES, graphqlRequest } from "@/graphql";
import ThemeSwitcherWrapper from "@components/theme/theme-switch";
import LogoIcon from "@components/common/icons/LogoIcon";
import UserAccount from "@components/customer/credentials";
import { getStorefrontSeoPayload } from "@/utils/server/storefront-seo";
import type { NextHeaderSettings } from "@/lib/storefront-experience/document";

export default async function Navbar({
  allowsCheckout = true,
  editorial,
}: {
  allowsCheckout?: boolean;
  editorial?: NextHeaderSettings;
}) {
  let filteredCategories: Array<{
    id: string;
    name: string;
    slug: string;
  }> = [];

  try {
    if (!editorial?.menu_links.length) {
    const data = await graphqlRequest<any>(
      GET_TREE_CATEGORIES,
      { getCategoryTree: true },
      { tags: ["categories"], life: "hours" }
    );

    const categories = Array.isArray(data?.homeCategories)
      ? data.homeCategories
      : [];

    filteredCategories = categories
      .filter((cat: any) => cat.id !== "1")
      .map((cat: any) => {
        return {
          id: cat.id,
          name: cat.name || "",
          slug: cat.slug || "",
        };
      })
      .filter((item: any) => item.name && item.slug);
    }
  } catch (error) {
    console.error("Unable to resolve navbar categories:", error);
  }

  const branding = await getStorefrontSeoPayload();
  const logoSrc = editorial?.logo_url || branding?.image;
  const logoAlt = editorial?.brand_name || branding?.siteName || branding?.title || "JectStore";

  const menuData: Array<{ id: string; name: string; slug: string; href?: string }> = editorial?.menu_links.length ? editorial.menu_links.map((link, index) => ({ id: `editorial-${index}`, name: link.label, slug: "", href: link.url })) : [
    { id: "all", name: "Todo", slug: "" },
    ...filteredCategories.slice(0, 3),
  ];

  return (
    <>
      <header className="sticky top-0 z-10" data-storefront-section-id={editorial ? "region-header" : undefined}>
        <nav className="relative flex flex-col items-center justify-between gap-4 bg-neutral-50 p-4 dark:bg-neutral-900 md:flex-row lg:px-6 lg:py-4">
          <div className="flex w-full items-center justify-between gap-0 sm:gap-4">
            <div className="flex min-w-0 max-w-fit items-center gap-2 lg:max-w-[50%] xl:gap-6">
              <Suspense fallback={null}>
                <MobileMenu menu={menuData} allowsCheckout={allowsCheckout} />
              </Suspense>
              <Link
                className="flex h-9 w-full shrink-0 scale-95 items-center md:h-9 md:w-auto lg:h-10"
                href="/"
                aria-label="Ir al inicio"
              >
                <LogoIcon src={logoSrc} alt={logoAlt} />
              </Link>
              <ul className="hidden min-w-0 flex-1 gap-4 text-sm md:items-center lg:flex xl:gap-6">
                {menuData.map(
                  (item) => (
                    <li key={item?.id + item?.name} className={`min-w-0 ${editorial?.menu_links.length ? "flex-initial" : "flex-1 first:flex-none"}`}>
                      <Link
                        className="relative block truncate text-neutral-500 before:absolute before:bottom-0 before:left-0 before:h-px before:w-0 before:bg-current before:transition-all before:duration-300 before:content-[''] hover:text-black hover:before:w-full dark:text-neutral-400 dark:hover:text-neutral-300"
                        href={item.href ?? (item.slug ? `/search/${item.slug}` : "/search")}
                        prefetch={true}
                        aria-label={`Ver productos de ${item.name}`}
                        title={item.name}
                      >
                        {item.name}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </div>
            <div className="hidden min-w-0 flex-1 justify-center md:flex [&>div]:min-w-0">
              <Suspense fallback={<SearchSkeleton />}>
                <Search search={false} />
              </Suspense>
            </div>
            <div className="flex shrink-0 gap-2 md:gap-4">
              <div className="flex">
                <ThemeSwitcherWrapper />
              </div>
              {allowsCheckout ? (
                <div className="hidden lg:block">
                  <Cart />
                </div>
              ) : null}
              <Suspense fallback={<IconSkeleton />}>
                <div className="hidden lg:block">
                  <UserAccount />
                </div>
              </Suspense>
            </div>
          </div>
        </nav>
      </header>
    </>
  );
}
