import { gql } from "@apollo/client";

export const CREATE_MERGE_CART = gql`
  mutation createMergeCart(
    $cartId: Int!
    $guestCartToken: String
  ) {
    createMergeCart(
      input: {
        cartId: $cartId
        guestCartToken: $guestCartToken
      }
    ) {
      mergeCart {
        id
         taxAmount
         subtotal
        shippingAmount
        grandTotal
        items {
          edges {
            node {
              id
              cartId
              productId
              name
               price
               baseImage
              sku
              quantity
              type
              productUrlKey
              canChangeQty
            }
          }
        }
      }
    }
  }
`;
