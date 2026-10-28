import Link from "next/link";
import type { NextStoreIntroSettings } from "@/lib/storefront-experience/document";

/** Literal fallback markup: no extra catalogue padding or mobile search. */
export default function StoreIntro({ settings }: { settings: Readonly<NextStoreIntroSettings> }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pb-24 lg:pt-16">
      <div className="rounded-[32px] border border-neutral-200 bg-white px-6 py-12 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:px-10 lg:px-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">{settings.eyebrow}</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">{settings.heading}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600 sm:text-base">{settings.body}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href={settings.primary_url} className="inline-flex items-center justify-center rounded-full bg-neutral-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800">{settings.primary_label}</Link>
          <Link href={settings.secondary_url} className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-6 py-3 text-sm font-semibold text-neutral-900 transition hover:border-neutral-900 hover:bg-neutral-50">{settings.secondary_label}</Link>
        </div>
      </div>
    </section>
  );
}
