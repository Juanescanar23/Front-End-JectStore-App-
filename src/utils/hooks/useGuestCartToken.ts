"use client";

import { useEffect, useState, useRef } from "react";
import { fetchHandler } from "../fetch-handler";
import { GUEST_CART_ID, GUEST_CART_TOKEN, IS_GUEST } from "@/utils/constants";
import { encodeJWT, decodeJWT } from "@/utils/jwt-cookie";
import { setCookie, deleteCookie, getNativeCookie } from "../getCartToken";

let tokenCreated = false;
let tokenPromise: Promise<string | null> | null = null;

// ---------------------------
// Main Hook
// ---------------------------
export const useGuestCartToken = () => {
  const [token, setToken] = useState<string | null>(null);
  const [cartId, setCartId] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  const isResettingRef = useRef(false);

  const persistGuestCart = (cart: { id?: unknown; sessionToken?: unknown; isGuest?: unknown }, expectedToken: string): boolean => {
    if (cart?.isGuest !== true || getNativeCookie(IS_GUEST) === "false") return false;

    const currentCookie = getNativeCookie(GUEST_CART_TOKEN);
    const currentToken = currentCookie ? decodeJWT<{ sessionToken: string }>(currentCookie)?.sessionToken : null;
    // A late Add response must not replace a login, reset, or newer guest cart.
    if (!expectedToken || currentToken !== expectedToken) return false;

    const newCartId = typeof cart.id === "string" && /^[1-9]\d*$/.test(cart.id)
      ? Number(cart.id) : typeof cart.id === "number" ? cart.id : NaN;
    const sessionToken = cart.sessionToken;
    // This checks only the issued token's wire format. Tenant/DB binding and
    // its signature remain server authority; never fall back to cartToken/ID.
    if (!Number.isSafeInteger(newCartId) || newCartId < 1
      || typeof sessionToken !== "string" || sessionToken.length > 4096
      || sessionToken !== sessionToken.trim()
      || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(sessionToken)) return false;

    const encoded = encodeJWT({ sessionToken, cartId: newCartId, isGuest: true });
    // The encoded envelope is ASCII. Reserve room for the cookie name,
    // assignment, expiry and path rather than limiting only the raw proof.
    if (!encoded || encoded.length + GUEST_CART_TOKEN.length + 1 + 64 > 4096) return false;

    try {
      setCookie(GUEST_CART_TOKEN, encoded);
      const stored = getNativeCookie(GUEST_CART_TOKEN);
      const restored = stored ? decodeJWT<{ sessionToken: string; cartId: number; isGuest: boolean }>(stored) : null;
      if (restored?.sessionToken !== sessionToken || restored.cartId !== newCartId || restored.isGuest !== true) return false;

      setCookie(GUEST_CART_ID, String(newCartId));
      setCookie(IS_GUEST, "true");
      if (getNativeCookie(GUEST_CART_ID) !== String(newCartId) || getNativeCookie(IS_GUEST) !== "true") return false;
    } catch {
      return false;
    }

    tokenCreated = true;
    setToken(sessionToken);
    setCartId(newCartId);
    return true;
  };

  const createGuestToken = async (): Promise<string | null> => {
    if (tokenPromise) return tokenPromise;

    tokenPromise = (async () => {
      if (tokenCreated) {
        // Return existing raw token from cookie
        const cookieVal = getNativeCookie(GUEST_CART_TOKEN);
        if (cookieVal) {
          const isGuest = getNativeCookie(IS_GUEST) !== "false";
          const decoded = decodeJWT<{ sessionToken: string }>(cookieVal, isGuest);
          return decoded?.sessionToken ?? null;
        }
        return null;
      }
      tokenCreated = true;

      try {
        const res = await fetchHandler({
          url: "cart/createGuestToken",
          method: "POST",
          contentType: true,
        });

        const cart = res?.data?.createCartToken?.cartToken;
        if (!cart) {
          tokenCreated = false;
          return null;
        }

        const newToken = encodeJWT({
          sessionToken: cart.sessionToken,
          cartId: cart.id,
          isGuest: cart.isGuest,
        });
        const newCartId = Number(cart.id);

        setCookie(GUEST_CART_TOKEN, newToken);
        setCookie(GUEST_CART_ID, String(newCartId));
        setCookie(IS_GUEST, String(cart?.isGuest));

        // State and return should be the RAW token
        setToken(cart.sessionToken);
        setCartId(newCartId);
        return cart.sessionToken;
      } catch (e) {
        console.error("Error creating guest token:", e);
        tokenCreated = false;
        return null;
      } finally {
        tokenPromise = null;
      }
    })();

    return tokenPromise;
  };

  const resetGuestToken = async () => {
    if (isResettingRef.current) return;
    isResettingRef.current = true;

    tokenCreated = false;

    // delete old
    deleteCookie(GUEST_CART_TOKEN);
    deleteCookie(GUEST_CART_ID);

    await createGuestToken();

    isResettingRef.current = false;
  };

  useEffect(() => {
    const cookieToken = getNativeCookie(GUEST_CART_TOKEN);

    if (cookieToken) {
      const isGuest = getNativeCookie(IS_GUEST) !== "false";
      const decoded = decodeJWT<{
        sessionToken: string;
        cartId: number;
        isGuest: boolean;
      }>(cookieToken, isGuest);

      if (decoded) {
        // Cookie state is external and browser-only. Restore it after hydration
        // rather than reading document.cookie during server/client initial render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setToken(decoded.sessionToken);
        setCartId(decoded.cartId);
      }
    }

    setIsReady(true);
  }, []);

  return {
    token,
    cartId,
    isReady,
    createGuestToken,
    persistGuestCart,
    resetGuestToken,
    deleteCookie,
  };
};
