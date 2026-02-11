export const GET_FOOTER = `
  query footerQuery {
    themeCustomization {
      id
      themeCode
      type
      name
      status
      sortOrder
      translations {
        id
        themeCustomizationId
        localeCode
        options {
          title
          css
          html
          links {
            title
            link
            image
            imageUrl
            url
            slug
            type
            id
          }
          images {
            title
            link
            image
            imageUrl
            url
            slug
            type
            id
          }
          filters {
            key
            value
          }
          column_1 {
            url
            title
            sortOrder
          }
          column_2 {
            url
            title
            sortOrder
          }
          column_3 {
            url
            title
            sortOrder
          }
          services {
            title
            description
            serviceIcon
          }
        }
      }
    }
  }
`;
