import { canonicalExperienceHost } from "@/lib/storefront-experience/runtime";

/** The ingress Host is authority; forwarding/tenant hints never select a tenant. */
export function requestHost(headers: Pick<Headers, "get">): string {
  return canonicalExperienceHost(headers.get("host"));
}
