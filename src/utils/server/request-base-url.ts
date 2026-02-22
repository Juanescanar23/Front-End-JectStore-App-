import "server-only";
import { headers } from "next/headers";

const ABSOLUTE_URL_REGEX = /^https?:\/\//i;

export async function getRequestBaseUrl() {
  const headerList = await headers();

  const rawHost =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const host = rawHost.split(",")[0]?.trim();

  if (!host) {
    return null;
  }

  const rawProto = headerList.get("x-forwarded-proto") ?? "";
  const forwardedProto = rawProto.split(",")[0]?.trim().toLowerCase();
  const fallbackProto =
    host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https";
  const protocol =
    forwardedProto && ABSOLUTE_URL_REGEX.test(`${forwardedProto}://`)
      ? forwardedProto.replace("://", "")
      : forwardedProto || fallbackProto;

  return `${protocol}://${host}`;
}
