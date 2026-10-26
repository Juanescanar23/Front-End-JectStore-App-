import { decode, type JWT, type JWTDecodeParams } from "next-auth/jwt";

export const TENANT_SESSION_VERSION = 1;

export function isTenantSession(token: unknown, host: string): token is JWT {
  return Boolean(host && token && typeof token === "object"
    && (token as JWT).tenant_session_version === TENANT_SESSION_VERSION
    && (token as JWT).tenant_host === host);
}

/** Verify NextAuth's authenticated encryption before checking the owning Host. */
export async function decodeTenantSession(params: JWTDecodeParams, host: string): Promise<JWT | null> {
  try {
    const token = await decode(params);
    return isTenantSession(token, host) ? token : null;
  } catch {
    return null;
  }
}
