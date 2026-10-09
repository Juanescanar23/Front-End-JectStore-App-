// "use server";

/**
 * Revalidate all product-related caches
 */
export async function revalidateProducts() {
  throw new Error("Use the authenticated tenant-scoped storefront revalidation endpoint.");
}

/**
 * Revalidate search-related caches
 */
export async function revalidateSearch() {
  throw new Error("Use the authenticated tenant-scoped storefront revalidation endpoint.");
}

/**
 * Revalidate a specific product page
 */
export async function revalidateProductPage(_productId: string) {
  throw new Error("Use the authenticated tenant-scoped storefront revalidation endpoint.");
}

/**
 * Revalidate search page
 */
export async function revalidateSearchPage() {
  throw new Error("Use the authenticated tenant-scoped storefront revalidation endpoint.");
}

/**
 * Revalidate all caches (use sparingly)
 */
export async function revalidateAll() {
  throw new Error("Use the authenticated tenant-scoped storefront revalidation endpoint.");
}
