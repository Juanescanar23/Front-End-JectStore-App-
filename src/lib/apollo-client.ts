import { GRAPHQL_URL, STOREFRONT_KEY } from "@/utils/constants";
import { ApolloClient, HttpLink, InMemoryCache, from } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { getSession } from "next-auth/react";

const normalizeBase = (value?: string) => {
  if (!value) return "";
  return value.replace(/\/+$/, "");
};

export default function initializeApollo() {
  const ssrMode = typeof window === "undefined";
  const cache = new InMemoryCache();
  const serverBase = normalizeBase(
    process.env.BAGISTO_SERVER_ENDPOINT || process.env.NEXT_PUBLIC_BAGISTO_ENDPOINT
  );
  const graphqlUri =
    ssrMode && GRAPHQL_URL?.startsWith("/") && serverBase
      ? `${serverBase}${GRAPHQL_URL}`
      : GRAPHQL_URL;

  const httpLink = new HttpLink({
    uri: graphqlUri,
    credentials: "include", 
    headers: {
      "X-STOREFRONT-KEY": STOREFRONT_KEY || "",
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
        fetchPolicy: ssrMode ? "network-only" : "cache-first",
        nextFetchPolicy: ssrMode ? "network-only" : "cache-first",
      },
      query: {
        fetchPolicy: ssrMode ? "network-only" : "cache-first",
      },
    },
  });
}
