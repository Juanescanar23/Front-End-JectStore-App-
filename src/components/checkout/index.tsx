"use client";
import { useAppSelector } from "@/store/hooks";
import CheckoutSkeleton from "../common/skeleton/CheckoutSkeleton";
import { CartSkeleton } from "../common/skeleton/ProductCartSkeleton";
import { useCartDetail } from "@/utils/hooks/useCartDetail";
import CheckoutCart from "./checkout-cart/CheckoutCart";
import Stepper from "./stepper";
import { useState, useEffect, useSyncExternalStore } from 'react';
import { useAddressesFromApi } from "@utils/helper";
import { useScrollToTop } from "@/utils/hooks/useScrollTo";
import "./checkout-theme.css";



interface CheckOutProps {
  step: string;
}

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const CheckOut = ({ step }: CheckOutProps) => {
  // Cookies and localStorage are unavailable in SSR. Keep the first hydration
  // render identical before mounting the browser-dependent checkout steps.
  const hydrated = useSyncExternalStore(subscribeToHydration, getClientSnapshot, getServerSnapshot);
  const { isLoading } = useCartDetail();
  const showLoading = !hydrated || isLoading;
  const { billingAddress, shippingAddress } = useAddressesFromApi();
  const cartDetail = useAppSelector((state) => state.cartDetail);
  const cartItems = cartDetail?.cart;
  const selectedShippingRate = cartItems?.selectedShippingRate;
  const selectedShippingRateTitle = cartItems?.selectedShippingRateTitle || cartItems?.selectedShippingRate;
  const selectedPayment = cartItems?.paymentMethod;
  const selectedPaymentTitle = cartItems?.paymentMethodTitle;
  const [isOpen, setIsOpen] = useState(!selectedPayment);
  useScrollToTop();

  useEffect(() => {
    if (selectedPayment) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsOpen(false);
    }
  }, [selectedPayment]);



  return (
    <section className="sf-checkout grid gap-6 text-sf-content lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,440px)] lg:gap-8">
      <div className="min-w-0">
        <div className="rounded-[28px] border border-sf-border bg-sf-surface px-4 py-4 text-sf-content shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          {showLoading ? (
            <CheckoutSkeleton />
          ) : (
            <Stepper
              billingAddress={billingAddress}
              currentStep={step}
              selectedPayment={selectedPayment}
              selectedPaymentTitle={selectedPaymentTitle}
              selectedShippingRate={selectedShippingRate}
              selectedShippingRateTitle={selectedShippingRateTitle}
              shippingAddress={shippingAddress}
              setIsOpen={setIsOpen}
              isOpen={isOpen}
            />
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="w-full lg:sticky lg:top-6">
          {showLoading ? (
            <CartSkeleton className="w-full" />
          ) : (
            <CheckoutCart
              cartItems={cartItems}
              selectedShippingRate={selectedShippingRate}
            />
          )}
        </div>
      </div>
    </section>
  );
};

export default CheckOut;
