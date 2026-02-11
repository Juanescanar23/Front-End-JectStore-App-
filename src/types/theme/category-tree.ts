export interface TreeCategoriesVariables {
  getCategoryTree?: boolean;
}

export interface CategoryNode {
  id: string;
  position?: number | null;
  logoPath?: string | null;
  logoUrl?: string | null;
  status?: boolean | null;
  name: string;
  slug: string;
  urlPath?: string | null;
  description?: string | null;
  metaTitle?: string | null;
  children?: CategoryNode[];
}


export interface TreeCategoriesResponse {
  homeCategories: CategoryNode[];
}

export interface CategoryTranslationNode {
  name: string;
  slug: string;
  urlPath?: string | null;
  description?: string | null;
  metaTitle?: string | null;
}
export interface CategoryTranslationEdge {
  node: CategoryTranslationNode;
}

export interface CategoryTranslationConnection {
  edges: CategoryTranslationEdge[];
}
