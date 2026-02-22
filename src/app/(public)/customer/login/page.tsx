import LoginForm from "@components/customer/LoginForm";
import { generateMetadataForPage } from "@utils/helper";
import { staticSeo } from "@utils/metadata";
import { getRequestBaseUrl } from "@/utils/server/request-base-url";

export const revalidate = 60;

export async function generateMetadata() {
  const baseUrl = await getRequestBaseUrl();
  return generateMetadataForPage("", {
    ...staticSeo.login,
    baseUrl: baseUrl ?? undefined,
  });
}


export default async function LoginPage() {
  return <LoginForm />;
}
