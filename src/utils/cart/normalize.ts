import { NOT_IMAGE, getImageUrl } from "@/utils/constants";
import { safeParse } from "@utils/helper";

type CartImageObject = {
  small_image_url?: string | null;
  smallImageUrl?: string | null;
  medium_image_url?: string | null;
  mediumImageUrl?: string | null;
  large_image_url?: string | null;
  largeImageUrl?: string | null;
  original_image_url?: string | null;
  originalImageUrl?: string | null;
  url?: string | null;
  imageUrl?: string | null;
};

const pushCandidate = (candidates: string[], value: unknown) => {
  if (typeof value !== "string") return;

  const normalized = value.trim();

  if (!normalized) return;

  candidates.push(normalized);
};

export function resolveCartItemImage(baseImage: unknown) {
  const candidates: string[] = [];
  const parsed = safeParse<CartImageObject>(baseImage as any);
  const hasStructuredPayload =
    !!parsed && typeof parsed === "object" && !Array.isArray(parsed);

  // Some Bagisto payloads send `baseImage` as a JSON string; treat that as
  // structured data, not as a literal image URL.
  if (typeof baseImage === "string" && !hasStructuredPayload) {
    pushCandidate(candidates, baseImage);
  }

  if (hasStructuredPayload) {
    pushCandidate(candidates, parsed.small_image_url);
    pushCandidate(candidates, parsed.smallImageUrl);
    pushCandidate(candidates, parsed.medium_image_url);
    pushCandidate(candidates, parsed.mediumImageUrl);
    pushCandidate(candidates, parsed.large_image_url);
    pushCandidate(candidates, parsed.largeImageUrl);
    pushCandidate(candidates, parsed.original_image_url);
    pushCandidate(candidates, parsed.originalImageUrl);
    pushCandidate(candidates, parsed.url);
    pushCandidate(candidates, parsed.imageUrl);
  }

  const runtimeBaseUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  return getImageUrl(candidates[0], runtimeBaseUrl, NOT_IMAGE) || NOT_IMAGE;
}

export function resolveReadCartPayload(data: any) {
  return (
    data?.data?.createReadCart?.readCart ||
    data?.createReadCart?.readCart ||
    data?.readCart ||
    data?.cart ||
    null
  );
}
