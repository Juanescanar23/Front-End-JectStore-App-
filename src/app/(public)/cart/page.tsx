import CartPageShell from "./CartPageShell";
import StorefrontVisit from "@/components/common/StorefrontVisit";

export default function LegacyCartPage() {
  return <><StorefrontVisit pageType="cart" /><CartPageShell /></>;
}
