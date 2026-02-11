import { gql } from "@apollo/client";

export const GET_TREE_CATEGORIES = gql`
  query homeCategories($getCategoryTree: Boolean) {
    homeCategories(getCategoryTree: $getCategoryTree) {
      id
      position
      logoPath
      logoUrl
      status
      name
      slug
      urlPath
      description
      metaTitle
      children {
        id
        position
        logoPath
        logoUrl
        status
        name
        slug
        urlPath
        description
        metaTitle
        children {
          id
          position
          logoPath
          logoUrl
          status
          name
          slug
          urlPath
          description
          metaTitle
        }
      }
    }
  }
`;
