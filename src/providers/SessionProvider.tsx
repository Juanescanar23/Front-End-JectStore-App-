"use client";

import {
  SessionContext,
  SessionProvider as NextAuthSessionProvider,
  type SessionContextValue,
} from "next-auth/react";
import { createContext, type ReactNode } from "react";

export const ReadonlyPreviewContext = createContext(false);

const readonlyPreviewSession: SessionContextValue = {
  data: null,
  status: "unauthenticated",
  update: async () => null,
};

export function SessionProvider({
  children,
  readonlyPreview = false,
}: {
  children: ReactNode;
  readonlyPreview?: boolean;
}) {
  if (readonlyPreview) {
    // A sandboxed editor preview has no customer session. Do not mount
    // NextAuth's focus/storage listeners, polling or initial session fetch.
    return (
      <ReadonlyPreviewContext.Provider value={true}>
        <SessionContext.Provider value={readonlyPreviewSession}>
          {children}
        </SessionContext.Provider>
      </ReadonlyPreviewContext.Provider>
    );
  }

  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
