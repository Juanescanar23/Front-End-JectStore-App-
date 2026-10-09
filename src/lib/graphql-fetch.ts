import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { print, type DocumentNode } from "graphql";
import {
  type ApolloQueryResult,
  type OperationVariables,
} from "@apollo/client";
import makeClient from "./apollo-client";
import { GRAPHQL_URL } from "@/utils/constants";
import { canonicalCacheHostname, storefrontCacheTags } from "@/utils/storefront-cache-scope";
import {
  buildTenantForwardHeaders,
  resolveServerGraphqlUrl,
  resolveTenantHostForRequest,
} from "@/utils/graphql-endpoint";

const FALLBACK_LANDLORD_HOST = "app.jectstore.com";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);
const STOREFRONT_REALTIME_MODE =
  process.env.NODE_ENV !== "production" ||
  process.env.STOREFRONT_REALTIME_MODE === "true";

const normalizeBase = (value?: string | null) => {
  if (!value) return "";
  return value.replace(/\/+$/, "");
};

const normalizeHostHeader = (value?: string | null) =>
  (value ?? "").split(",")[0]?.trim();

const normalizeHostname = (value?: string | null) =>
  normalizeHostHeader(value)
    ?.toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/:\d+$/, "")
    .replace(/\/$/, "");

const getLandlordHost = () =>
  normalizeHostname(
    process.env.NEXT_PUBLIC_LANDLORD_HOST || FALLBACK_LANDLORD_HOST,
  ) || FALLBACK_LANDLORD_HOST;

const resolveRuntimeHost = (headerStore: Headers) => {
  const landlordHost = getLandlordHost();
  const candidates = [
    headerStore.get("x-tenant-host"),
    headerStore.get("x-storefront-host"),
    headerStore.get("x-original-host"),
    headerStore.get("host"),
    headerStore.get("x-forwarded-host"),
  ]
    .map(normalizeHostHeader)
    .filter((value): value is string => Boolean(value));

  if (!candidates.length) return "";

  const tenantCandidate = candidates.find((candidate) => {
    const hostname = normalizeHostname(candidate);
    return (
      Boolean(hostname) &&
      hostname !== landlordHost &&
      !LOCAL_HOSTNAMES.has(hostname)
    );
  });

  return tenantCandidate || candidates[0];
};

const resolveRuntimeProtocol = (headerStore: Headers, host: string) => {
  const rawProto = headerStore.get("x-forwarded-proto");
  const forwardedProto = normalizeHostHeader(rawProto)
    ?.toLowerCase()
    .replace("://", "");

  if (forwardedProto === "http" || forwardedProto === "https") {
    return forwardedProto;
  }

  const normalizedHost = normalizeHostname(host);
  if (normalizedHost && LOCAL_HOSTNAMES.has(normalizedHost)) {
    return "http";
  }

  return "https";
};

const resolveServerGraphqlTarget = async () => {
  if (!GRAPHQL_URL) {
    return {
      uri: GRAPHQL_URL,
      tenantHost: "",
    };
  }

  const headerStore = await headers();
  const host = resolveRuntimeHost(headerStore);

  if (!host) {
    return {
      uri: GRAPHQL_URL,
      tenantHost: "",
    };
  }

  const resolvedUri = resolveServerGraphqlUrl(GRAPHQL_URL, host);
  if (!resolvedUri) {
    return {
      uri: GRAPHQL_URL,
      tenantHost: "",
    };
  }

  if (!resolvedUri.startsWith("/")) {
    return {
      uri: resolvedUri,
      tenantHost: resolveTenantHostForRequest(host),
    };
  }

  const proto = resolveRuntimeProtocol(headerStore, host);
  const base = normalizeBase(host);

  return {
    uri: `${proto}://${base}${resolvedUri}`,
    tenantHost: "",
  };
};

async function getClient() {
  const ssrMode = typeof window === "undefined";
  if (!ssrMode) {
    return makeClient();
  }

  const { uri, tenantHost } = await resolveServerGraphqlTarget();
  const tenantHeaders = buildTenantForwardHeaders(tenantHost);

  return makeClient({
    uri,
    extraHeaders: Object.keys(tenantHeaders).length
      ? tenantHeaders
      : undefined,
  });
}


export type CacheLifePreset =
  | "seconds"
  | "minutes"
  | "hours"
  | "days"
  | "weeks"
  | "max";

export type CacheLifeOption = number | CacheLifePreset;

export function getRevalidateTime(life?: CacheLifeOption): number | false {
  if (!life) return false;
  if (typeof life === "number") return life;

  switch (life) {
    case "seconds": return 10;
    case "minutes": return 60;
    case "hours": return 3600;
    case "days": return 86400;
    case "weeks": return 604800;
    case "max": return false;
    default: return false;
  }
}

const queryPrintMemo = new WeakMap<DocumentNode, string>();

const resolveRequestScope = async (): Promise<string> => {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.host}`;
  }

  const headerStore = await headers();
  const host = resolveRuntimeHost(headerStore) || "default";
  const proto = resolveRuntimeProtocol(headerStore, host);

  return `${proto}://${host}`;
};

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map(key => `"${key}":${stableStringify(obj[key])}`)
    .join(",")}}`;
}


export interface GraphQLRequestOptions {
  tags?: string[];
  life?: CacheLifeOption;
  noCache?: boolean;
  context?: Record<string, unknown>;
  fetchPolicy?: "cache-first" | "network-only" | "no-cache" | "cache-only";
}



export async function graphqlRequest<
  TData = unknown,
  TVariables extends OperationVariables = OperationVariables
>(
  query: DocumentNode,
  variables?: TVariables,
  options?: GraphQLRequestOptions
): Promise<TData> {
  const bypassCache = options?.noCache || STOREFRONT_REALTIME_MODE;

  if (bypassCache) {
    const client = await getClient();
    const result: ApolloQueryResult<TData> = await client.query({
      query,
      variables,
      context: options?.context,
      fetchPolicy: options?.fetchPolicy ?? "network-only",
    });
    return result.data;
  }

  if (options?.context) {
    throw new Error(
      "graphqlRequest: Caching with `context` is unsafe. Use noCache instead."
    );
  }

  let queryString: string;
  const cached = queryPrintMemo.get(query);
  if (cached !== undefined) {
    queryString = cached;
  } else {
    queryString = print(query);
    queryPrintMemo.set(query, queryString);
  }

  const scope = await resolveRequestScope();
  const cacheHost = canonicalCacheHostname(new URL(scope).host);
  if (!cacheHost) {
    return graphqlRequest(query, variables, { ...options, noCache: true });
  }
  // A namespace bump avoids reusing legacy entries with only global tags.
  // They expire naturally; no other tenant's data is flushed during rollout.
  const cacheKey = `graphql:sf-v1:${stableStringify({
    scope,
    query: queryString,
    variables,
  })}`;

  const client = await getClient();
  const cachedQuery = unstable_cache(
    async (): Promise<TData> => {
      const result: ApolloQueryResult<TData> = await client.query({
        query,
        variables,
        fetchPolicy: "network-only",
      });
      return result.data;
    },
    [cacheKey],
    {
      tags: await storefrontCacheTags(cacheHost, options?.tags),
      revalidate: getRevalidateTime(options?.life),
    }
  );

  return cachedQuery();
}


export async function graphqlRequestNoCache<
  TData = unknown,
  TVariables extends OperationVariables = OperationVariables
>(
  query: DocumentNode,
  variables?: TVariables,
  options?: Omit<GraphQLRequestOptions, "noCache" | "tags" | "life">
): Promise<TData> {
  return graphqlRequest<TData, TVariables>(query, variables, {
    ...options,
    noCache: true,
  });
}
