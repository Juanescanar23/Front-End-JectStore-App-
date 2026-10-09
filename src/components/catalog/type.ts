export interface CacheImage {
  smallImageUrl?: string | null;
  mediumImageUrl?: string | null;
  largeImageUrl?: string | null;
  originalImageUrl?: string | null;
}

export interface ProductCashOnDeliveryCommerce {
  available?: boolean | null;
}

export interface ProductSoldOutCommerce {
  showWhatsappCta?: boolean | null;
  whatsappUrl?: string | null;
}

export interface ProductCommerce {
  payment?: {
    cashOnDelivery?: ProductCashOnDeliveryCommerce | null;
  } | null;
  soldOut?: ProductSoldOutCommerce | null;
}

export interface ProductSectionNode {
  id: string;
  sku: string;
  type: string;
  urlKey?: string;
  name?: string;
  baseImageUrl?: string | null;
  price?: number | string | null;
  specialPrice?: number | string | null;
  isSaleable?: boolean | null;
  commerce?: ProductCommerce | null;
  cacheBaseImage?: CacheImage[] | CacheImage | null;
  cacheGalleryImages?: CacheImage[] | CacheImage | null;
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
  perPage?: number;
  total: number;
  hasMorePages?: boolean;
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
  getFilterAttribute?: {
    id?: string;
    minPrice?: number;
    maxPrice?: number;
    filterAttributes?: Array<{
      id: string;
      code: string;
      adminName?: string;
      options: Array<{
        id: string;
        adminName: string;
        translations: Array<{
          id: string;
          label: string;
          locale: string;
        }>;
      }>;
    }>;
    sortOrders?: Array<{
      key?: string;
      title?: string;
      value?: string;
      sort?: string;
      order?: string;
      position?: string;
    }>;
  } | null;
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
  commerce?: ProductCommerce | null;
  variants?: ProductNode[] | null;
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
