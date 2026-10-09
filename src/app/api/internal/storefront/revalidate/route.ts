import { NextRequest, NextResponse } from "next/server";
import { handleStorefrontRevalidation, readRevalidationBody } from "@/utils/server/storefront-revalidation";
import { revalidateStorefront } from "@/utils/server/revalidate-storefront";
import { canonicalCacheHostname } from "@/utils/storefront-cache-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // No NEXT_PUBLIC secret, no credential in the URL, no merchant-controlled
  // endpoint. The replay directory is private persistent state outside builds.
  const receiverHosts = (process.env.STOREFRONT_REVALIDATE_ALLOWED_HOSTS || "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  const rawHost = request.headers.get("host") || "";
  const receiverHost = canonicalCacheHostname(rawHost);
  if (!receiverHost || !receiverHosts.includes(receiverHost)) {
    return NextResponse.json({ revalidated: false, message: "Invalid platform scope." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  // Next's URL can contain the internal upstream address behind the reverse
  // proxy. Only the directly allowlisted Host is authoritative here. Never use
  // x-forwarded-host/x-tenant-host to expand the receiver's allowlist.
  const protocolUrl = new URL(request.url);
  protocolUrl.host = receiverHost;
  let body: string;
  try {
    body = await readRevalidationBody(request.body, request.headers.get("content-length"));
  } catch {
    return NextResponse.json({ revalidated: false, message: "Invalid request." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const result = await handleStorefrontRevalidation({
    method: request.method,
    url: protocolUrl.toString(),
    host: rawHost,
    contentType: request.headers.get("content-type") || "",
    signature: request.headers.get("x-jectstore-revalidate-signature") || "",
    body,
  }, {
    signingKey: process.env.STOREFRONT_REVALIDATE_SIGNING_KEY || "",
    allowedReceiverHosts: receiverHosts,
    replayDirectory: process.env.STOREFRONT_REVALIDATE_REPLAY_DIR || "",
    invalidateHosts: revalidateStorefront,
  });
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
