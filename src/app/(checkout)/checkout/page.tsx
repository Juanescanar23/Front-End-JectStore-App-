import CheckOut from "@/components/checkout";
import StorefrontVisit from "@/components/common/StorefrontVisit";

export default async function Information({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { step = "email" } = (await searchParams) ?? {};
  return (
    <>
      <StorefrontVisit pageType="checkout" />
      <CheckOut step={typeof step === "string" ? step : "email"} />
    </>
  );
}
