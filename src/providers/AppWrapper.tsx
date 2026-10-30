import {MainProvider} from "./MainProvider";
import { StorefrontCurrencyProvider } from "./StorefrontCurrencyProvider";
import { getStorefrontCurrencyCode } from "@/utils/server/storefront-currency";

interface AppWrapperProps {
  children: React.ReactNode;
  className?: string;
}

async function AppWrapper({ children }: AppWrapperProps) {
  // Missing metadata must not relabel an amount or make the entire shop fail.
  const currencyCode = await getStorefrontCurrencyCode().catch(() => null);
  return (
        <StorefrontCurrencyProvider currencyCode={currencyCode}>
          <MainProvider>
            {children}
          </MainProvider>
        </StorefrontCurrencyProvider>
  );
}

export { AppWrapper };
