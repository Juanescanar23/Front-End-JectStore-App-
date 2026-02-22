import { GET_THEME_CUSTOMIZATION } from "@/graphql";
import { graphqlRequest } from "../../lib/graphql-fetch";
import RenderThemeCustomization from "@components/home/RenderThemeCustomization";
import { ThemeCustomizationResponse } from "@/types/theme/theme-customization";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await graphqlRequest<ThemeCustomizationResponse>(GET_THEME_CUSTOMIZATION, undefined, {
    tags: ["home", "theme", "theme-customization"],
    life: "hours"
  });

  return (
    <RenderThemeCustomization themeCustomizations={data?.themeCustomization} />
  );
}
