import Navbar from "@components/layout/navbar";
import { Suspense, type ReactNode } from "react";
export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <div className="block lg:hidden">
        <Suspense fallback={<div aria-hidden="true" className="h-[68px] bg-neutral-50 dark:bg-neutral-900" />}>
          <Navbar />
        </Suspense>
      </div>
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-3 sm:px-6 lg:px-10 lg:pb-12 lg:pt-6 xl:px-14">
        {children}
      </main>
    </>
  );
}
