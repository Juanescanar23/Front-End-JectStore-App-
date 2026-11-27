"use client";

import { createContext, type ReactNode } from "react";

export const StorefrontErrorNameContext = createContext<string | null>(null);

export function StorefrontErrorNameProvider({ name, children }: { name: string | null; children: ReactNode }) {
  return <StorefrontErrorNameContext value={name}>{children}</StorefrontErrorNameContext>;
}
