import { gql } from "@apollo/client";

export const GET_HOME_CATEGORIES = gql`
  query HomeCategories($getCategoryTree: Boolean) {
    homeCategories(getCategoryTree: $getCategoryTree) {
      id
      logoUrl
      position
      name
      slug
    }
  }
`;
