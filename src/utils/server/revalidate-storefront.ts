import { revalidateTag } from "next/cache";
import { storefrontHostTag } from "../storefront-cache-scope";

const IMMEDIATE_REVALIDATE = { expire: 0 } as const;

export async function revalidateStorefront(hosts: string[]): Promise<void> {
  // Only called with host scopes verified by the v1 HMAC boundary. No global
  // entity tags or revalidatePath('/') shared by every storefront are touched.
  for (const host of hosts) {
    revalidateTag(await storefrontHostTag(host), IMMEDIATE_REVALIDATE);
  }
}
