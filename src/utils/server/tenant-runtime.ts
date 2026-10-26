import { headers } from "next/headers";
import { requestHost } from "@/utils/request-host";

const FALLBACK_LANDLORD_HOST = "app.jectstore.com";
const FALLBACK_LANDLORD_SCHEME = "https";

export const normalizeHost = (value?: string | null) =>
  (value || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/:\d+$/, "")
    .replace(/\/$/, "");

export const normalizeScheme = (value?: string | null) =>
  (value || FALLBACK_LANDLORD_SCHEME).replace(/:$/, "").toLowerCase();

export const getLandlordHost = () =>
  normalizeHost(process.env.NEXT_PUBLIC_LANDLORD_HOST || FALLBACK_LANDLORD_HOST) ||
  FALLBACK_LANDLORD_HOST;

export const getLandlordScheme = () =>
  normalizeScheme(process.env.NEXT_PUBLIC_LANDLORD_SCHEME || FALLBACK_LANDLORD_SCHEME);

export const isLandlordHost = (host?: string | null) => {
  const runtimeHost = normalizeHost(host);
  if (!runtimeHost) return false;
  return runtimeHost === getLandlordHost();
};

export async function getRuntimeHost(): Promise<string> {
  const headerStore = await headers();
  return requestHost(headerStore);
}

export function getDefaultTenantPlanForHost(runtimeHost: string): string {
  const envDefault = (process.env.NEXT_PUBLIC_DEFAULT_TENANT_PLAN || "emprendedor")
    .trim()
    .toLowerCase();

  if (isLandlordHost(runtimeHost)) {
    return "basic";
  }

  return envDefault || "emprendedor";
}

export function buildLandlordUrl(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${getLandlordScheme()}://${getLandlordHost()}${safePath}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

export async function fetchLandlordJson<T = unknown>(
  path: string,
  options?: {
    runtimeHost?: string;
    query?: Record<string, string | number | boolean | null | undefined>;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    headers?: Record<string, string>;
    cache?: RequestCache;
  },
): Promise<{
  ok: boolean;
  status: number;
  data: T | null;
}> {
  const runtimeHost = normalizeHost(options?.runtimeHost);
  const url = buildLandlordUrl(path, {
    ...(runtimeHost ? { host: runtimeHost } : {}),
    ...(options?.query || {}),
  });

  try {
    const response = await fetch(url, {
      method: options?.method || "GET",
      cache: options?.cache || "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    let json: T | null = null;

    if (text) {
      try {
        json = JSON.parse(text) as T;
      } catch {
        json = null;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data: json,
    };
  } catch {
    return {
      ok: false,
      status: 503,
      data: null,
    };
  }
}
