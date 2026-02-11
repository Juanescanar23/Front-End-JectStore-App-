import { gql } from "@apollo/client";
import {
  PRODUCT_CORE_FRAGMENT,
  PRODUCT_DETAILED_FRAGMENT,
  PRODUCT_SECTION_FRAGMENT,
} from "../fragments";

/**
 * Fetch paginated products with filtering and sorting
 * @param query - Search query string
 * @param sortKey - Field to sort by
 * @param reverse - Sort in reverse order
 * @param first - Number of items to fetch
 * @param after - Cursor for forward pagination
 * @param before - Cursor for backward pagination
 * @param channel - Sales channel
 * @param locale - Locale for localized content
 */
export const GET_PRODUCTS = gql`
  ${PRODUCT_CORE_FRAGMENT}

  query GetProducts($input: FilterProductsInput!) {
    products(input: $input) {
      paginatorInfo {
        count
        currentPage
        lastPage
        perPage
        total
        hasMorePages
      }
      data {
        ...ProductCore
      }
    }
  }
`;

/**
 * Fetch a single product by ID with all details
 * @param id - Product ID
 */
export const GET_PRODUCT_BY_URL_KEY = gql`
  ${PRODUCT_DETAILED_FRAGMENT}

  query GetProductById($urlKey: String!) {
    product(urlKey: $urlKey) {
      ...ProductDetailed
    }
  }
`;

export const GET_PRODUCT_SWATCH_REVIEW = gql`
  query ProductSwatchReview($urlKey: String!) {
    product(urlKey: $urlKey) {
      id
      name
      sku
      type
      urlKey
      price
      isSaleable
      combinations
      superAttributeOptions
      attributeValues {
        value
        attribute {
          adminName
          code
          isFilterable
          isVisibleOnFront
        }
      }
      superAttributes {
        id
        code
        adminName
        options {
          id
          adminName
        }
      }
    }
  }
`;


/**
 * Fetch pagination info for products
 * Lightweight query for pagination controls
 */
export const GET_PRODUCTS_PAGINATION = gql`
  query GetProductsPagination($input: FilterProductsInput!) {
    products(input: $input) {
      paginatorInfo {
        count
        currentPage
        lastPage
        perPage
        total
        hasMorePages
      }
      data {
        id
      }
    }
  }
`;

/**
 * Fetch related products for a given product
 * @param id - Product ID
 * @param first - Number of related products to fetch
 */
export const GET_RELATED_PRODUCTS = gql`
  ${PRODUCT_SECTION_FRAGMENT}

  query GetRelatedProducts($urlKey: String) {
    product(urlKey: $urlKey) {
      id
      sku
      relatedProducts {
        ...ProductSection
      }
    }
  }
`;
