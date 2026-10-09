import {
  CodLocationCity,
  CodLocationCountry,
  CodLocationRegion,
} from "@/types/cod";
import { fetchLandlordJson } from "@/utils/server/tenant-runtime";

const readArray = (payload: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(payload)) return payload;

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const unsafe = payload as Record<string, unknown>;

  for (const key of keys) {
    if (Array.isArray(unsafe[key])) {
      return unsafe[key] as unknown[];
    }
  }

  if (unsafe.data && typeof unsafe.data === "object") {
    const nested = unsafe.data as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(nested[key])) {
        return nested[key] as unknown[];
      }
    }
  }

  return [];
};

const normalizeCountry = (value: unknown): CodLocationCountry | null => {
  if (!value || typeof value !== "object") return null;
  const unsafe = value as Record<string, unknown>;

  const codeCandidate = unsafe.code ?? unsafe.country_code ?? unsafe.id;
  const nameCandidate = unsafe.name ?? unsafe.label ?? unsafe.country_name;

  const code = typeof codeCandidate === "string" ? codeCandidate.trim() : "";
  const name = typeof nameCandidate === "string" ? nameCandidate.trim() : "";

  if (!code || !name) return null;

  return {
    code,
    name,
  };
};

const normalizeRegion = (value: unknown): CodLocationRegion | null => {
  if (!value || typeof value !== "object") return null;
  const unsafe = value as Record<string, unknown>;

  const idCandidate = unsafe.id ?? unsafe.region_id ?? unsafe.code;
  const nameCandidate = unsafe.name ?? unsafe.label ?? unsafe.region_name;

  const id = idCandidate == null ? "" : String(idCandidate).trim();
  const name = typeof nameCandidate === "string" ? nameCandidate.trim() : "";

  if (!id || !name) return null;

  const code = typeof unsafe.code === "string" ? unsafe.code.trim() : undefined;

  return {
    id,
    name,
    ...(code ? { code } : {}),
  };
};

const normalizeCity = (value: unknown): CodLocationCity | null => {
  if (!value || typeof value !== "object") return null;
  const unsafe = value as Record<string, unknown>;

  const idCandidate = unsafe.id ?? unsafe.city_id ?? unsafe.code;
  const nameCandidate = unsafe.name ?? unsafe.label ?? unsafe.city_name;

  const id = idCandidate == null ? "" : String(idCandidate).trim();
  const name = typeof nameCandidate === "string" ? nameCandidate.trim() : "";

  if (!id || !name) return null;

  return {
    id,
    name,
  };
};

async function fetchFromCandidates<T>(
  candidates: Array<{
    path: string;
    query?: Record<string, string | number | boolean | null | undefined>;
    keys: string[];
  }>,
  runtimeHost: string,
  normalizer: (value: unknown) => T | null,
): Promise<T[]> {
  for (const candidate of candidates) {
    const response = await fetchLandlordJson<unknown>(candidate.path, {
      runtimeHost,
      method: "GET",
      cache: "no-store",
      query: candidate.query,
    });

    if (!response.ok || !response.data) {
      continue;
    }

    const rows = readArray(response.data, candidate.keys)
      .map(normalizer)
      .filter((entry): entry is T => Boolean(entry));

    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
}

export async function getLocationCountries(runtimeHost: string): Promise<CodLocationCountry[]> {
  return fetchFromCandidates(
    [
      {
        path: "/api/storefront/locations/countries",
        keys: ["countries", "items", "data"],
      },
      {
        path: "/api/locations/countries",
        keys: ["countries", "items", "data"],
      },
    ],
    runtimeHost,
    normalizeCountry,
  );
}

export async function getLocationRegions(
  runtimeHost: string,
  countryCode: string,
): Promise<CodLocationRegion[]> {
  return fetchFromCandidates(
    [
      {
        path: `/api/storefront/locations/${encodeURIComponent(countryCode)}/regions`,
        keys: ["regions", "items", "data"],
      },
      {
        path: `/api/locations/${encodeURIComponent(countryCode)}/regions`,
        keys: ["regions", "items", "data"],
      },
    ],
    runtimeHost,
    normalizeRegion,
  );
}

export async function getLocationCities(
  runtimeHost: string,
  countryCode: string,
  regionId?: string,
): Promise<CodLocationCity[]> {
  return fetchFromCandidates(
    [
      {
        path: `/api/storefront/locations/${encodeURIComponent(countryCode)}/cities`,
        query: regionId ? { region_id: regionId } : undefined,
        keys: ["cities", "items", "data"],
      },
      {
        path: `/api/locations/${encodeURIComponent(countryCode)}/cities`,
        query: regionId ? { region_id: regionId } : undefined,
        keys: ["cities", "items", "data"],
      },
    ],
    runtimeHost,
    normalizeCity,
  );
}
