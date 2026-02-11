export interface ThemeTranslationNode {
  id: string;
  themeCustomizationId: number;
  localeCode: string;
  options: string | Record<string, unknown>;
}

export interface ThemeCustomizationNode {
  id: string;
  themeCode?: string | null;
  type?: string | null;
  name?: string | null;
  status?: boolean | string | null;
  sortOrder?: number | null;
  translations: ThemeTranslationNode[];
}

export interface ThemeCustomizationResponse {
  themeCustomization: ThemeCustomizationNode[];
}



// footer 
export interface ThemeOptions {
  title: string;
  url: string;
}
export interface FooterColumns {
  column_1?: ThemeOptions[];
  column_2?: ThemeOptions[];
  column_3?: ThemeOptions[];
}
export interface GetFooterResponse {
  themeCustomization: ThemeCustomizationNode[];
}

export interface GetFooterVariables {}

export interface ThemeCustomizationTranslationNode {
  id: string;
  themeCustomizationId: number;
  localeCode: string;
  options: string | FooterColumns | Record<string, unknown>;
}

export interface FooterMenuProps {
  menu: ThemeCustomizationNode[];
}

export interface ThemeCustomizationResult {
  footer_links: ThemeCustomizationNode[] | null;
  services_content: ThemeCustomizationNode[] | null;
}
