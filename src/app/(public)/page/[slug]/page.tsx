import CmsPage from "../../[page]/page";

export default async function LegacyCmsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return CmsPage({ params: Promise.resolve({ page: slug }) });
}
