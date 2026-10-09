"use client";

import dynamic from "next/dynamic";

const CartPage = dynamic(() => import("@/components/cart/CartPage"), {
  ssr: false,
  loading: () => (
    <section className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pb-20 lg:pt-10">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_390px]">
        <div className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="mb-6 h-10 w-56 animate-pulse rounded-full bg-neutral-200" />
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="flex animate-pulse gap-4 rounded-2xl border border-neutral-100 px-4 py-4"
              >
                <div className="h-24 w-24 rounded-2xl bg-neutral-200" />
                <div className="flex flex-1 flex-col gap-3">
                  <div className="h-5 w-3/4 rounded bg-neutral-200" />
                  <div className="h-4 w-1/3 rounded bg-neutral-200" />
                  <div className="h-4 w-1/4 rounded bg-neutral-200" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] bg-neutral-950 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
          <div className="mb-5 h-5 w-24 animate-pulse rounded bg-white/15" />
          <div className="space-y-4">
            <div className="h-4 w-full animate-pulse rounded bg-white/15" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-white/15" />
            <div className="h-12 w-full animate-pulse rounded-full bg-white/15" />
          </div>
        </div>
      </div>
    </section>
  ),
});

export default function CartPageShell() {
  return <CartPage />;
}
