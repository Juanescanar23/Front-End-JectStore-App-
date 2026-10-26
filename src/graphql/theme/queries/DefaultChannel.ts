import { gql } from "@apollo/client";

export const GET_DEFAULT_CHANNEL = gql`
  query DefaultChannel {
    getDefaultChannel {
      id
      code
      name
      description
      logoUrl
      faviconUrl
      homeSeo {
        metaTitle
        metaDescription
      }
      defaultLocale {
        code
      }
      baseCurrency {
        code
      }
    }
  }
`;
