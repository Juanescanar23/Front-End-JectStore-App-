import { gql } from "@apollo/client";

export const PRODUCT_CORE_FRAGMENT = gql`
  fragment ProductCore on Product {
    id
    sku
    type
    name
    urlKey
    price
    specialPrice
    isSaleable
    images {
      url
    }
    cacheBaseImage {
      smallImageUrl
      mediumImageUrl
      largeImageUrl
      originalImageUrl
    }
    cacheGalleryImages {
      smallImageUrl
      mediumImageUrl
      largeImageUrl
      originalImageUrl
    }
    categories {
      id
      slug
      name
    }
  }
`;

export const PRODUCT_DETAILED_FRAGMENT = gql`
  fragment ProductDetailed on Product {
    id
    sku
    type
    name
    urlKey
    description
    shortDescription
    price
    specialPrice
    isSaleable
  }
`;

export const PRODUCT_REVIEW_FRAGMENT = gql`
  fragment ProductReview on Review {
    rating
    id
    name
    title
    comment
  }
`;

export const PRODUCT_SECTION_FRAGMENT = gql`
  fragment ProductSection on Product {
    id
    sku
    name
    urlKey
    type
    price
    specialPrice
    isSaleable
    images {
      url
    }
    cacheBaseImage {
      smallImageUrl
      mediumImageUrl
      largeImageUrl
      originalImageUrl
    }
    cacheGalleryImages {
      smallImageUrl
      mediumImageUrl
      largeImageUrl
      originalImageUrl
    }
    categories {
      id
      slug
      name
    }
  }
`;
