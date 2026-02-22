type SearchParamValue = string | string[] | undefined;

export type StorefrontFilterInput = {
  key: string;
  value: string;
};

const RESERVED_QUERY_PARAMS = new Set(["q", "page", "sort"]);

const SORT_TO_FILTER_MAP: Record<string, { sort: string; order: string }> = {
  "name-asc": { sort: "name", order: "asc" },
  "name-desc": { sort: "name", order: "desc" },
  "price-asc": { sort: "price", order: "asc" },
  "price-desc": { sort: "price", order: "desc" },
  newest: { sort: "created_at", order: "desc" },
  oldest: { sort: "created_at", order: "asc" },
};

const normalizeFilterValue = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalizeFilterValue(item))
      .filter((item): item is string => Boolean(item))
      .join(",");

    return normalized || null;
  }

  const str = String(value).trim();
  return str === "" ? null : str;
};

const appendFilter = (
  map: Map<string, string>,
  key: string,
  value: unknown
) => {
  const normalized = normalizeFilterValue(value);
  if (!normalized) return;
  map.set(key, normalized);
};

export const resolveSortToStorefrontFilters = (sortValue?: string) => {
  if (!sortValue) return {};
  return SORT_TO_FILTER_MAP[sortValue] ?? {};
};

export const buildStorefrontFilterInput = ({
  base = {},
  searchParams = {},
  reserved = RESERVED_QUERY_PARAMS,
}: {
  base?: Record<string, unknown>;
  searchParams?: Record<string, SearchParamValue>;
  reserved?: Set<string>;
}): StorefrontFilterInput[] => {
  const map = new Map<string, string>();

  Object.entries(base).forEach(([key, value]) => appendFilter(map, key, value));

  Object.entries(searchParams).forEach(([key, value]) => {
    if (reserved.has(key)) return;
    appendFilter(map, key, value);
  });

  return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
};
