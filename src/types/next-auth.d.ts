import { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface User extends DefaultUser {
    id: string;
    apiToken?: string;
    accessToken: string;
    role: string;
    tenant_host?: string;
    tenant_session_version?: number;
  }

  interface Session {
    user: {
      id?: string;
      firstname?: string;
      lastname?: string;
      token?: string;
      accessToken?: string;
    } & DefaultSession['user'];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    apiToken?: string;
    accessToken: string;
    role: string;
    tenant_host?: string;
    tenant_session_version?: number;
  }
}
