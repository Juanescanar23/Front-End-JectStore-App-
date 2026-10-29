import { GRAPHQL_URL, STOREFRONT_KEY } from "@/utils/constants";
import { ApolloClient, HttpLink, InMemoryCache, from } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { getSession } from "next-auth/react";
import { resolveTenantScopedGraphqlUrl } from "@/utils/graphql-endpoint";

export default function initializeApollo(options?: {
  uri?: string;
  extraHeaders?: Record<string, string>;
  serverFetch?: typeof fetch;
}) {
  const ssrMode = typeof window === "undefined";
  const cache = new InMemoryCache();
  const runtimeHost = typeof window !== "undefined" ? window.location.host : "";
  const configuredUri = options?.uri ?? GRAPHQL_URL;
  const graphqlUri =
    resolveTenantScopedGraphqlUrl(configuredUri, runtimeHost) ?? configuredUri;
  // This module is also imported by the browser provider. The server-only
  // signer is injected by graphql-fetch; never import its key/crypto here.
  const serverFetch = ssrMode
    ? options?.serverFetch ?? (() => Promise.reject(new Error("No pudimos conectar con la tienda. Vuelve a intentarlo.")))
    : undefined;

  const httpLink = new HttpLink({
    uri: graphqlUri,
    credentials: "include",
    fetch: serverFetch,
    headers: {
      "X-STOREFRONT-KEY": STOREFRONT_KEY || "",
      ...(options?.extraHeaders || {}),
    },
  });

  const authLink = setContext(async (_, { headers }) => {
    if (ssrMode) {
      return { headers };
    }

    const session = await getSession();
    const userToken = session?.user?.accessToken;

    return {
      headers: {
        ...headers,
        ...(userToken && { authorization: `Bearer ${userToken}` }),
        "Content-Type": "application/json",
      },
    };
  });

  return new ApolloClient({
    ssrMode,
    link: from([authLink, httpLink]),
    cache: cache,
    defaultOptions: {
      watchQuery: {
        fetchPolicy: ssrMode ? "no-cache" : "cache-first",
        nextFetchPolicy: ssrMode ? "no-cache" : "cache-first",
      },
      query: {
        fetchPolicy: ssrMode ? "no-cache" : "cache-first",
      },
    },
  });
}
