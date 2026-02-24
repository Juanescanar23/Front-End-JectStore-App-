import { gql } from "@apollo/client";

export const PAGE_BY_URL_KEY = gql`
  query PageByUrlKey($input: FilterCmsPageInput, $first: Int!, $page: Int) {
    cmsPages(input: $input, first: $first, page: $page) {
      data {
        id
        updatedAt
        translations {
          id
          metaTitle
          pageTitle
          urlKey
          htmlContent
          cmsPageId
          locale
        }
      }
    }
  }
`;
