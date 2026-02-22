import RegistrationForm from "@components/customer/RegistrationForm";
import { generateMetadataForPage } from "@utils/helper";
import { staticSeo } from "@utils/metadata";
import { getRequestBaseUrl } from "@/utils/server/request-base-url";

 export const revalidate = 60;

export async function generateMetadata() {
  const baseUrl = await getRequestBaseUrl();
  return generateMetadataForPage("", {
    ...staticSeo.register,
    baseUrl: baseUrl ?? undefined,
  });
}

export default async function Register() {
  return <RegistrationForm />;
}
