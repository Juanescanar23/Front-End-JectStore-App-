export const CHECKOUT_WHATSAPP_AVAILABILITY = `
  query CheckoutWhatsAppAvailability {
    storefrontWhatsAppOrderAvailable
  }
`;

export const CREATE_WHATSAPP_ORDER = `
  mutation CreateWhatsAppOrder($cartId: Int!) {
    createWhatsAppOrder(cartId: $cartId) { id number status whatsappUrl receiptToken }
  }
`;

export const READ_WHATSAPP_ORDER = `
  query ReadWhatsAppOrder($id: Int!, $receiptToken: String) {
    readWhatsAppOrder(id: $id, receiptToken: $receiptToken) { id number status whatsappUrl }
  }
`;
