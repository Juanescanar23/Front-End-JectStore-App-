"use client";

import Link from "next/link";
import { useContext, type ComponentProps } from "react";
import { ReadonlyPreviewContext } from "@/providers/SessionProvider";

export default function StorefrontLink({ prefetch, ...props }: ComponentProps<typeof Link>) {
  const readonlyPreview = useContext(ReadonlyPreviewContext);

  // The editor iframe has an opaque origin. It cannot navigate the storefront
  // and must not speculate on public routes from inside its sandbox.
  return <Link {...props} prefetch={readonlyPreview ? false : prefetch} />;
}
