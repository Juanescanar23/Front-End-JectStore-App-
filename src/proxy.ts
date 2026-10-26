import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { decodeTenantSession } from "@/utils/tenant-session";
import {
  canonicalExperienceHost, decodeExperiencePin, encodeExperiencePin, experienceRequestAuthority,
  EXPERIENCE_COOKIE, EXPERIENCE_REQUEST_HEADER, experiencesEnabledForHost,
  fetchStorefrontExperience, isExperiencePage, legacyGuestProof,
  nativeDestination, pinForExperience, requestPinForExperience, PIN_MAX_AGE, PREVIEW_PATH,
  PREVIEW_QUERY_HEADER, runtimeSigningKey, safeRequestHeaders,
  StorefrontExperienceError, validatePreviewQuery, type ExperiencePin,
} from "@/lib/storefront-experience/runtime";

function unavailable(error: unknown) {
  const status = error instanceof StorefrontExperienceError ? error.status : 503;
  console.error("Storefront experience unavailable:", error instanceof StorefrontExperienceError ? error.code : "runtime");
  return new NextResponse(
    "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Tienda no disponible</title><main><h1>No pudimos cargar esta versión de la tienda</h1><p>Vuelve a intentarlo en unos momentos. Tu carrito no se ha modificado.</p><a href=\"/\">Volver a intentar</a></main></html>",
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } },
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  try {
    const authority = experienceRequestAuthority(request.headers.get("host"));
    const host = canonicalExperienceHost(authority);
    const forwarded = safeRequestHeaders(request.headers, host, request.nextUrl.protocol);
    if (pathname === PREVIEW_PATH || pathname === `${PREVIEW_PATH}/`) {
      if (!experiencesEnabledForHost(host)) return new NextResponse(null, { status: 404 });
      runtimeSigningKey();
      const query = validatePreviewQuery(request.nextUrl.search);
      forwarded.set(PREVIEW_QUERY_HEADER, query);
      const locale = new URLSearchParams(query).get("locale");
      if (locale && /^[A-Za-z]{2,8}(?:[_-][A-Za-z0-9]{2,8})*$/.test(locale)) forwarded.set("x-locale", locale);
      const response = NextResponse.next({ request: { headers: forwarded } });
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      response.headers.set("X-Frame-Options", "SAMEORIGIN");
      return response;
    }

    let response: NextResponse | undefined;
    if (experiencesEnabledForHost(host) && isExperiencePage(pathname)) {
      const signingKey = runtimeSigningKey();
      let previous = decodeExperiencePin(request.cookies.get(EXPERIENCE_COOKIE)?.value, host, signingKey);
      if (previous?.mode === "request") previous = null;
      let legacyGuestToken: string | undefined;
      if (!previous) {
        // A cookie's presence is never proof of identity: NextAuth verifies its JWT.
        const session = process.env.NEXTAUTH_SECRET ? await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, decode: (params) => decodeTenantSession(params, host) }) : null;
        if (session) {
          const now = Math.floor(Date.now() / 1000);
          previous = { v: 1, mode: "session", host, base_key: "next-current", published_revision_id: null, issued_at: now, expires_at: now + PIN_MAX_AGE };
        } else {
          // Only Laravel can verify the encrypted/signed guest token against its tenant/cart.
          legacyGuestToken = legacyGuestProof(request.cookies.get("guest_cart_token")?.value);
        }
      }
      const selection = previous ? encodeExperiencePin(previous, signingKey) : undefined;
      const experience = await fetchStorefrontExperience({ host, incoming: forwarded, pin: selection, legacyGuestToken });
      const pin: ExperiencePin = pinForExperience(experience, host, previous);
      const signed = encodeExperiencePin(pin, signingKey);
      forwarded.set("x-locale", experience.locale);
      forwarded.set("x-jectstore-experience-channel", String(experience.channel.id));
      forwarded.set("x-jectstore-experience-revision", String(experience.published_revision_id ?? 0));
      if (experience.engine === "visual") {
        // The dedicated native ingress is loopback-only and restores this scoped Host.
        forwarded.set("x-jectstore-native-host", authority);
        // Laravel's published-theme resolver validates this exact request release.
        forwarded.set("x-jectstore-experience-pin", encodeExperiencePin(requestPinForExperience(experience, host), signingKey));
        response = NextResponse.rewrite(nativeDestination(pathname, request.nextUrl.search), { request: { headers: forwarded } });
      } else {
        forwarded.set(EXPERIENCE_REQUEST_HEADER, encodeExperiencePin(requestPinForExperience(experience, host), signingKey));
        response = NextResponse.next({ request: { headers: forwarded } });
      }
      response.cookies.set(EXPERIENCE_COOKIE, signed, {
        httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/",
        maxAge: Math.max(0, pin.expires_at - Math.floor(Date.now() / 1000)),
      });
      response.headers.set("Cache-Control", "private, no-store");
      if (experience.engine === "visual") return response;
    }

    if (["/customer/login", "/customer/register"].includes(pathname)) {
      const token = process.env.NEXTAUTH_SECRET ? await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, decode: (params) => decodeTenantSession(params, host) }) : null;
      if (token) {
        const redirect = NextResponse.redirect(new URL("/", request.url));
        for (const cookie of response?.cookies.getAll() || []) redirect.cookies.set(cookie);
        return redirect;
      }
    }
    return response || NextResponse.next({ request: { headers: forwarded } });
  } catch (error) {
    return unavailable(error);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api(?:/|$)|admin(?:/|$)|graphql(?:/|$)|storage(?:/|$)|themes(?:/|$)|vendor(?:/|$)|assets(?:/|$)|css(?:/|$)|js(?:/|$)|cache(?:/|$)|portal(?:/|$)|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)"],
};
