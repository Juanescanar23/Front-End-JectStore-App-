import { GET_THEME_CUSTOMIZATION } from "@/graphql";
import { graphqlRequest } from "../../lib/graphql-fetch";
import RenderThemeCustomization from "@components/home/RenderThemeCustomization";
import { ThemeCustomizationResponse } from "@/types/theme/theme-customization";
import { getStorefrontExperience } from "@/lib/storefront-experience/server";
import RenderStorefrontDocument from "@/components/home/RenderStorefrontDocument";
import StoreIntro from "@/components/home/StoreIntro";
import { STORE_INTRO_DEFAULTS } from "@/lib/storefront-experience/store-intro";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function Home() {
  const experience = await getStorefrontExperience();
  if (experience?.document) return <RenderStorefrontDocument document={experience.document} currency={experience.currency} />;
  let themeCustomizations: ThemeCustomizationResponse["themeCustomization"] | undefined;

  try {
    const data = await graphqlRequest<ThemeCustomizationResponse>(
      GET_THEME_CUSTOMIZATION,
      undefined,
      {
        tags: ["home", "theme", "theme-customization"],
        life: "hours",
      }
    );

    themeCustomizations = data?.themeCustomization;
  } catch (error) {
    console.error("Unable to resolve home theme customization:", error);
  }

  if (!Array.isArray(themeCustomizations) || themeCustomizations.length === 0) {
    return <StoreIntro settings={STORE_INTRO_DEFAULTS} />;
  }

  return (
    <RenderThemeCustomization themeCustomizations={themeCustomizations} currency={experience?.currency} />
  );
}
