"use client";
import { SessionProvider } from "next-auth/react";
import { useContext, type ReactNode } from "react";
import { ReadonlyPreviewContext } from "./SessionProvider";

export const NextAuthProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const readonlyPreview = useContext(ReadonlyPreviewContext);
  if (readonlyPreview) return <>{children}</>;

  return <SessionProvider>{children}</SessionProvider>;
}
