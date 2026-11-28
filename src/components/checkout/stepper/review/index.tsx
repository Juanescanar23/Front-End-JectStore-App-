import { FC } from "react";
import { AddressDataTypes } from "@/types/types";
import OrderReview from "./OrderReview";

export const Review: FC<{
  selectedPaymentTitle?: string;
  whatsappCartId?: number;
  shippingAddress?: AddressDataTypes;
  billingAddress?: AddressDataTypes;
  selectedShippingRate?: string;
  selectedShippingRateTitle?: string;
}> = ({
  selectedPaymentTitle,
  whatsappCartId,
  shippingAddress,
  billingAddress,
  selectedShippingRate,
  selectedShippingRateTitle,
}) => {
  return (
    <OrderReview
      billingAddress={billingAddress}
      selectedPaymentTitle={selectedPaymentTitle}
      whatsappCartId={whatsappCartId}
      selectedShipping={selectedShippingRate}
      selectedShippingRateTitle={selectedShippingRateTitle}
      shippingAddress={shippingAddress}
    />
  );
};

export default Review;
