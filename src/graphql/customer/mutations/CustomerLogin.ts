import { gql } from "@apollo/client";

export const CUSTOMER_LOGIN = gql`
  mutation loginCustomer($input: LoginInput!) {
    customerLogin(input: $input) {
      success
      message
      accessToken
      customer {
        id
        email
      }
    }
  }
`;
