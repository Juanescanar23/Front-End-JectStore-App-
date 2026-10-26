import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import {
  canonicalExperienceHost, decodeExperiencePin, EXPERIENCE_REQUEST_HEADER,
  experiencesEnabled, experiencesEnabledForHost, fetchStorefrontExperience,
  PREVIEW_QUERY_HEADER, StorefrontExperienceError,
} from "./runtime";

/** React memoizes one immutable release for the entire RSC request/shell. */
export const getStorefrontExperience = cache(async () => {
  if (!experiencesEnabled()) return null;
  const incoming = await headers();
  const host = canonicalExperienceHost(incoming.get("host"));
  if (!experiencesEnabledForHost(host)) return null;
  const selection = incoming.get(EXPERIENCE_REQUEST_HEADER);
  const pin = decodeExperiencePin(selection, host);
  if (!pin || pin.mode !== "request" || !selection) throw new StorefrontExperienceError("missing-request-selection");
  const experience = await fetchStorefrontExperience({ host, incoming, pin: selection });
  if (experience.engine !== "next" || experience.base_key !== pin.base_key
    || pin.published_revision_id !== experience.published_revision_id) {
    throw new StorefrontExperienceError("request-release-changed");
  }
  return experience;
});

/** Verified release identity for catalog-cache scope; never trust plaintext hints. */
export const getVerifiedExperienceContext = cache(async () => {
  if (!experiencesEnabled()) return null;
  const incoming = await headers();
  if (!experiencesEnabledForHost(canonicalExperienceHost(incoming.get("host")))) return null;
  if (incoming.has(PREVIEW_QUERY_HEADER)) return getNextPreviewExperience();
  if (incoming.has(EXPERIENCE_REQUEST_HEADER)) return getStorefrontExperience();
  // Reserved APIs keep their existing authentication/ownership and cache behavior.
  return null;
});

export const getNextPreviewExperience = cache(async () => {
  if (!experiencesEnabled()) throw new StorefrontExperienceError("preview-disabled", 404);
  const incoming = await headers();
  const host = canonicalExperienceHost(incoming.get("host"));
  if (!experiencesEnabledForHost(host)) throw new StorefrontExperienceError("preview-disabled", 404);
  const query = incoming.get(PREVIEW_QUERY_HEADER);
  if (!query) throw new StorefrontExperienceError("preview-query", 400);
  return fetchStorefrontExperience({
    host, incoming, previewQuery: query,
  });
});
