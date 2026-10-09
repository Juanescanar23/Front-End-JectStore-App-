import Navbar from "@components/layout/navbar";
import { ReactNode } from "react";
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <div className="block lg:hidden">
        <Navbar />
      </div>
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-8 pt-3 sm:px-6 lg:px-10 lg:pb-12 lg:pt-6 xl:px-14">
        {children}
      </main>
    </>
  );
}
