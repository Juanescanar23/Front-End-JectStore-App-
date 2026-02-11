import { gql } from "@apollo/client";
import { PRODUCT_SECTION_FRAGMENT } from "../fragments";

export const GET_FILTER_OPTIONS = gql`
  query FetchAttribute($id: ID!) {
    attribute(id: $id) {
      id
      code
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
  }
`;

export const GET_FILTER_PRODUCTS = gql`
  ${PRODUCT_SECTION_FRAGMENT}
  query getProducts($input: FilterProductsInput!) {
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
        ...ProductSection
      }
    }
  }
`;
