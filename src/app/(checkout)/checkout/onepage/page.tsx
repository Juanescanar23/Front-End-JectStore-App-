import { redirect } from "next/navigation";

type PageSearchParams = {
  [key: string]: string | string[] | undefined;
};

function appendSearchParam(
  params: URLSearchParams,
  key: string,
  value: string | string[] | undefined
) {
  if (Array.isArray(value)) {
    value
      .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      .forEach((entry) => params.append(key, entry));

    return;
  }

  if (typeof value === "string" && value.length > 0) {
    params.set(key, value);
  }
}

export default async function LegacyCheckoutPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const params = new URLSearchParams();
  const resolvedSearchParams = (await searchParams) ?? {};

  Object.entries(resolvedSearchParams).forEach(([key, value]) => {
    appendSearchParam(params, key, value);
  });

  const query = params.toString();

  redirect(query ? `/checkout?${query}` : "/checkout");
}
