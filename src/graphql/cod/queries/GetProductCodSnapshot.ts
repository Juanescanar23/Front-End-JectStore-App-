import { gql } from "@apollo/client";

export const GET_PRODUCT_COD_SNAPSHOT = gql`
  query GetProductCodSnapshot($input: [FilterHomeCategoriesInput!]) {
    products: allProducts(input: $input) {
      data {
        id
        name
        type
        price
        specialPrice
        priceHtml {
          currencyCode
        }
        isSaleable
        baseImageUrl
        images {
          url
          imageUrl
        }
        cacheBaseImage {
          smallImageUrl
          mediumImageUrl
          largeImageUrl
          originalImageUrl
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
          index {
            id
            attributeOptionIds {
              attributeCode
              attributeOptionId
            }
          }
        }
      }
    }
  }
`;
