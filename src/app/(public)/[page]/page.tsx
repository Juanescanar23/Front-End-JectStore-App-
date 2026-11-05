import { notFound } from "next/navigation";
import Prose from "@components/theme/search/Prose";
import { getPage } from "@utils/bagisto";
import { getStorefrontLocaleCode } from "@/utils/server/storefront-locale";
import { cmsUpdatedAt } from "@/utils/cms-updated-at";


export default async function Page({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page: pageParams } = await params;
  const [page, localeCode] = await Promise.all([
    getPage({ urlKey: pageParams }),
    getStorefrontLocaleCode(),
  ]);
  if (!page?.length) return notFound();
  const pageData = page?.[0]?.translation;
  const updatedAt = cmsUpdatedAt(page?.[0]?.updatedAt, localeCode);

  return (
    <div className="my-4 flex flex-col justify-between p-4">
      <div className="flex flex-col gap-4 mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold">{pageData?.pageTitle}</h1>
        <Prose className="mb-8" html={pageData?.htmlContent} />
      {updatedAt ? <p className="text-sm italic">
        {updatedAt.label}: <time dateTime={updatedAt.dateTime}>{updatedAt.dateLabel}</time>
      </p> : null}
      </div>
    </div>
  );
}
