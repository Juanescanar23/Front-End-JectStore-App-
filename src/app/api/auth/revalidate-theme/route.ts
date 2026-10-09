import { NextRequest, NextResponse } from "next/server";
import { revalidateStorefront } from "@/utils/server/revalidate-storefront";

const resolveSecret = () =>
  process.env.THEME_REVALIDATION_SECRET ||
  process.env.BAGISTO_REVALIDATION_SECRET;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expectedSecret = resolveSecret();
  const providedSecret =
    req.nextUrl.searchParams.get("secret") ||
    req.headers.get("x-revalidate-secret") ||
    "";

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json(
      {
        revalidated: false,
        message: "Invalid secret.",
      },
      { status: 401 },
    );
  }

  revalidateStorefront();

  return NextResponse.json({
    revalidated: true,
    now: Date.now(),
  });
}
