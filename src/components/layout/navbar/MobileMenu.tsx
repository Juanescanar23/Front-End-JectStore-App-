"use client";

import {
  Drawer,
  DrawerBody,
  DrawerContent,
} from "@heroui/drawer";
import { useDisclosure } from "@heroui/react";
import Link from "next/link";
import BottomNavbar from "./BottomNavbar";
import { MobileSearchBar } from "./MobileSearch";
import { useState } from "react";

export default function MobileMenu({
  menu,
  allowsCheckout = true,
}: {
  menu: any;
  allowsCheckout?: boolean;
}) {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [activeTab, setActiveTab] = useState<
    "home" | "category" | "cart" | "account" | null
  >(null);

  return (
    <>
      <BottomNavbar
        onMenuOpen={onOpen}
        setActiveTab={setActiveTab}
        activeTab={activeTab}
        allowsCheckout={allowsCheckout}
      />

      <Drawer
        backdrop="transparent"
        hideCloseButton
        isOpen={isOpen}
        radius="none"
        placement="left"
        onOpenChange={(open) => {
          onOpenChange();
          if (!open) {
            setActiveTab(null);
          }
        }}
        classNames={{
          base: "z-50",
          backdrop: "z-40",
          wrapper: "top-[68px] bottom-[64px]",
        }}
      >
        <DrawerContent
          className="
            z-50
            h-[calc(var(--visual-viewport-height)-132px)]
            max-h-[calc(var(--visual-viewport-height)-132px)]
          "
        >
          {(onClose) => (
            <>
              <DrawerBody className="px-4 py-4 overflow-y-auto">
                <MobileSearchBar onClose={onClose} />
                <h1 className="text-2xl text-black dark:text-white px-2 font-semibold">
                  {menu.some((item: { href?: string }) => item.href) ? "Menú" : "Categorías"}
                </h1>
                <ul className="flex w-full flex-col">
                  {menu.map((item: any) => (
                    <li
                      key={item.id + item.name}
                      className="p-2 text-xl text-black dark:text-white"
                    >
                      <Link
                        className={item.href ? "block break-words" : undefined}
                        href={item.href ?? (item.slug ? `/search/${item.slug}` : "/search")}
                        aria-label={`${item?.name}`}
                        onClick={onClose}
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </DrawerBody>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
