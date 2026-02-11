// Category List Types 


// Category Details Types 

export interface ProductOptionNode {
  id: string;
  adminName: string;
  isValid?: boolean; 
}

export interface ProductAttribute {
  id: string;
  code: string;
  adminName: string;
  options: ProductOptionNode[];
}
export type AttributeData = ProductAttribute;


export interface ProductReview {
  id: string;
  rating: number;
  name: string;
  title: string;
  comment: string;
}

export interface ProductReviewEdge {
  node: ProductReview;
}

export interface ProductVariant {
  id: string;
  sku: string;
  images?: Array<{ url?: string | null; imageUrl?: string | null }>;
}

export interface ProductNode {
  id: string;
  sku: string;
  type: string;
  name: string;
  urlKey: string;
  description?: string | null;
  shortDescription?: string | null;
  price: number | string | null;
  specialPrice?: number | string | null;
  images?: Array<{ url?: string | null; imageUrl?: string | null }>;
  cacheBaseImage?: Array<{ originalImageUrl?: string | null; largeImageUrl?: string | null }>;
  variants?: ProductVariant[] | null;
  reviews?: ProductReview[] | null;
}

export interface SingleProductResponse {
  product: ProductNode;
}
