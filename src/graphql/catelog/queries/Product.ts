import { gql } from "@apollo/client";
import {
  PRODUCT_CORE_FRAGMENT,
  PRODUCT_DETAILED_FRAGMENT,
  PRODUCT_REVIEW_FRAGMENT,
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

  query GetProducts($input: [FilterHomeCategoriesInput!]) {
    products: allProducts(input: $input) {
      paginatorInfo {
        count
        currentPage
        lastPage
        total
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
  ${PRODUCT_REVIEW_FRAGMENT}

  query GetProductByUrlKey($input: [FilterHomeCategoriesInput!]) {
    products: allProducts(input: $input) {
      data {
        ...ProductDetailed
        commerce {
          payment {
            cashOnDelivery {
              available
            }
          }
          soldOut {
            showWhatsappCta
            whatsappUrl
          }
        }
        images {
          url
        }
        cacheBaseImage {
          smallImageUrl
          mediumImageUrl
          largeImageUrl
          originalImageUrl
        }
        cacheGalleryImages {
          smallImageUrl
          mediumImageUrl
          largeImageUrl
          originalImageUrl
        }
        categories {
          id
          slug
          name
        }
        reviews {
          ...ProductReview
        }
        variants {
          id
          sku
          type
          name
          urlKey
          price
          specialPrice
          isSaleable
          commerce {
            payment {
              cashOnDelivery {
                available
              }
            }
            soldOut {
              showWhatsappCta
              whatsappUrl
            }
          }
          images {
            url
          }
          cacheBaseImage {
            smallImageUrl
            mediumImageUrl
            largeImageUrl
            originalImageUrl
          }
          cacheGalleryImages {
            smallImageUrl
            mediumImageUrl
            largeImageUrl
            originalImageUrl
          }
        }
      }
    }
  }
`;

export const GET_PRODUCT_SWATCH_REVIEW = gql`
  query ProductSwatchReview($input: [FilterHomeCategoriesInput!]) {
    products: allProducts(input: $input) {
      data {
        id
        name
        sku
        type
        urlKey
        price
        isSaleable
        attributeValues {
          id
          textValue
          booleanValue
          integerValue
          floatValue
          dateTimeValue
          dateValue
          jsonValue
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
        configutableData {
          attributes {
            id
            code
            label
            swatchType
            options {
              id
              label
              swatchType
              swatchValue
              products
            }
          }
          index {
            id
            attributeOptionIds {
              attributeId
              attributeCode
              attributeOptionId
            }
          }
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
  query GetProductsPagination($input: [FilterHomeCategoriesInput!]) {
    products: allProducts(input: $input) {
      paginatorInfo {
        count
        currentPage
        lastPage
        total
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

  query GetRelatedProducts($input: [FilterHomeCategoriesInput!]) {
    products: allProducts(input: $input) {
      data {
        id
        sku
        relatedProducts {
          ...ProductSection
        }
      }
    }
  }
`;
