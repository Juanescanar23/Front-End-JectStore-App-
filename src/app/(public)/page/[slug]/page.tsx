import { notFound, redirect } from "next/navigation";
import { cmsPageAliasHref, type CmsPageSearchParams } from "@/utils/cms-links";

/** Legacy CMS links share the existing canonical renderer and tenant context. */
export default async function LegacyCmsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<CmsPageSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const destination = cmsPageAliasHref(slug, query);
  if (!destination) return notFound();
  return redirect(destination);
}
