import dynamic from "next/dynamic";
import { generateMetadataForPage } from "@utils/helper";
import { staticSeo } from "@utils/metadata";
import { Suspense } from "react";
import ForgetSkeleton from "@components/common/skeleton/ForgetSkeleton";
import { getRequestBaseUrl } from "@/utils/server/request-base-url";
const ForgetPasswordForm = dynamic(() => import("@components/customer/ForgetPassword"));

export const revalidate = 3600;
export async function generateMetadata() {
  const baseUrl = await getRequestBaseUrl();
  return generateMetadataForPage("", {
    ...staticSeo.forget,
    baseUrl: baseUrl ?? undefined,
  });
}

export default function ForgetPasswordPage() {
  return (
    <Suspense fallback={<ForgetSkeleton />}>
      <ForgetPasswordForm />
    </Suspense>
  );
}
