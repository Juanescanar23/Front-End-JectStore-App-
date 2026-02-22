import { gql } from "@apollo/client";
import { PRODUCT_SECTION_FRAGMENT } from "../fragments";

export const GET_FILTER_OPTIONS = gql`
  query FetchFilterAttribute($categorySlug: String!) {
    getFilterAttribute(categorySlug: $categorySlug) {
      id
      minPrice
      maxPrice
      filterAttributes {
        id
        code
        adminName
        options {
          id
          adminName
          translations {
            id
            label
            locale
          }
        }
      }
      sortOrders {
        key
        title
        value
        sort
        order
        position
      }
    }
  }
`;

export const GET_FILTER_PRODUCTS = gql`
  ${PRODUCT_SECTION_FRAGMENT}
  query getProducts($input: [FilterHomeCategoriesInput!]) {
    products: allProducts(input: $input) {
      paginatorInfo {
        count
        currentPage
        lastPage
        total
      }
      data {
        ...ProductSection
      }
    }
  }
`;
