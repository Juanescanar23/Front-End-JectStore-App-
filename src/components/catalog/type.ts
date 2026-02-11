export interface CacheImage {
  smallImageUrl?: string | null;
  mediumImageUrl?: string | null;
  largeImageUrl?: string | null;
  originalImageUrl?: string | null;
}

export interface ProductSectionNode {
  id: string;
  sku: string;
  type: string;
  urlKey?: string;
  name?: string;
  price?: number | string | null;
  specialPrice?: number | string | null;
  isSaleable?: boolean | null;
  cacheBaseImage?: CacheImage[];
  cacheGalleryImages?: CacheImage[];
  images?: Array<{ url?: string | null; imageUrl?: string | null }>;
  categories?: Array<{ id?: string | number; slug?: string | null; name?: string | null }>;
}

export interface ProductNode extends ProductSectionNode {
  description?: string;
  shortDescription?: string;
  variants?: ProductNode[] | null;
  reviews?: ProductReviewNode[] | null;
  relatedProducts?: ProductSectionNode[] | null;
  crossSells?: ProductSectionNode[] | null;
  upSells?: ProductSectionNode[] | null;
  superAttributes?: any;
}

export interface PaginatorInfo {
  count: number;
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  hasMorePages: boolean;
}

export interface ProductsResponse {
  products: {
    paginatorInfo: PaginatorInfo;
    data: ProductNode[];
  };
}

export type ProductsSectionProps = {
  title: string;
  description: string;
  products: ProductSectionNode[];
};

export interface ProductFilterAttributeResponse {
  attribute: {
    id: string;
    code: string;
    options: Array<{
      id: string;
      adminName: string;
      translations: Array<{
        id: string;
        label: string;
        locale: string;
      }>;
    }>;
  };
}

export interface ProductReviewNode {
  id: string;
  rating: number;
  name?: string;
  title?: string;
  comment?: string;
}

export interface ProductData {
  id?: string;
  sku?: string;
  type?: string;
  name?: string;
  price?: { value?: number; currencyCode?: string } | number | string | null;
  specialPrice?: number | string | null;
  priceHtml?: { currencyCode?: string } | null;
  shortDescription?: string;
  description?: string;
  isSaleable?: boolean | null;
  configutableData?: {
    attributes?: unknown[];
    index?: unknown[];
  } | null;
}

export type additionalDataTypes = {
  attribute: any;
  id: string;
  code: string;
  label: string;
  value: null;
  admin_name: string;
  type: string;
};

// Product review

export interface RatingTypes {
  length?: number;
  value?: number;
  size?: string;
  className?: string;
  onChange?: (value: number) => void;
}

export interface ReviewDatatypes {
  id: string;
  name: string;
  title: string;
  rating: 5;
  status: string;
  comment: string;
  productId: string;
  customerId: string;
  createdAt: string;
  images: {
    url: string;
    reviewId: string;
  }[];
  customer: {
    name: string;
    imageUrl: string;
  };
}

export interface ReviewDetailProps {
  reviewDetails: ReviewDatatypes[];
  totalReview: number;
}
