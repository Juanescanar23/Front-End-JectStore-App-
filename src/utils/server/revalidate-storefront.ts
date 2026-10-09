import { revalidatePath, revalidateTag } from "next/cache";

const IMMEDIATE_REVALIDATE = { expire: 0 } as const;

export function revalidateStorefront(): void {
  // Use immediate expiry so the next storefront request renders fresh tenant data.
  revalidateTag("home", IMMEDIATE_REVALIDATE);
  revalidateTag("theme", IMMEDIATE_REVALIDATE);
  revalidateTag("theme-customization", IMMEDIATE_REVALIDATE);
  revalidateTag("products", IMMEDIATE_REVALIDATE);
  revalidateTag("related-products", IMMEDIATE_REVALIDATE);
  revalidateTag("swatch-and-reviews", IMMEDIATE_REVALIDATE);
  revalidateTag("categories", IMMEDIATE_REVALIDATE);
  revalidateTag("channel", IMMEDIATE_REVALIDATE);

  revalidatePath("/", "layout");
  revalidatePath("/", "page");
  revalidatePath("/search", "page");
  revalidatePath("/search/[collection]", "page");
  revalidatePath("/product/[...urlProduct]", "page");
}
