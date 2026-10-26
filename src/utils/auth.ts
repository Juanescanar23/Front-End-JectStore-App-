import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { bagistoFetch } from "@/utils/bagisto";
import { CUSTOMER_LOGIN } from "@/graphql/customer/mutations";
import { canonicalExperienceHost } from "@/lib/storefront-experience/runtime";
import { decodeTenantSession, isTenantSession, TENANT_SESSION_VERSION } from "@/utils/tenant-session";

/** Each request gets immutable host-bound callbacks; no shared mutable tenant. */
export function createTenantAuthOptions(rawHost: string): NextAuthOptions {
  const host = canonicalExperienceHost(rawHost);
  return {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  jwt: {
    decode: (params) => decodeTenantSession(params, host),
  },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Correo", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },


      authorize: async (credentials): Promise<any> => {
        if (!credentials?.username || !credentials?.password) {
          throw new Error("El correo y la contraseña son obligatorios.");
        }

        const input = {
          email: credentials.username,
          password: credentials.password,
        };


        const res = await bagistoFetch<any>({
          query: CUSTOMER_LOGIN,
          variables: { input },
          cache: "no-store",
          isCookies: false,
        });

        const data = res?.body?.data?.customerLogin;

        if (data?.success !== true || typeof data.accessToken !== "string" || !data.accessToken || !data.customer?.id) {
          throw new Error(data?.message || "Credenciales inválidas.");
        }

        return {
          id: String(data.customer.id),
          email: data.customer.email || credentials.username,
          name: data.customer.email || credentials.username,
          accessToken: data.accessToken,
          role: "customer",
          tenant_host: host,
          tenant_session_version: TENANT_SESSION_VERSION,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if (!isTenantSession(user, host)) throw new Error("Invalid tenant session");
        token.id = user.id;
        token.apiToken = user.apiToken;
        token.accessToken = user.accessToken;
        token.role = "customer";
        token.tenant_host = host;
        token.tenant_session_version = TENANT_SESSION_VERSION;
      }
      if (!isTenantSession(token, host)) throw new Error("Invalid tenant session");
      return token;
    },

    async session({ session, token }) {
      if (!isTenantSession(token, host)) throw new Error("Invalid tenant session");
      session.user = {
        ...session.user,
        id: token.id || "",
        apiToken: token.apiToken,
        accessToken: token.accessToken,
        role: token.role,
      };

      return session;
    },
  },

  pages: {
    signIn: "/customer/login",
    error: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
  };
}
