import CmsPageOgImage from "../../[page]/opengraph-image";

export default async function Image({ params }: { params: { slug: string } }) {
  return CmsPageOgImage({ params: { page: params.slug } });
}
