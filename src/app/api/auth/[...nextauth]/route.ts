import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { createTenantAuthOptions } from "@/utils/auth";
import { requestHost } from "@/utils/request-host";

function handler(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  return NextAuth(request, context, createTenantAuthOptions(requestHost(request.headers)));
}

export { handler as GET, handler as POST };
