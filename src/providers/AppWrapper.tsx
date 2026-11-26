import {MainProvider} from "./MainProvider";
import { StorefrontCurrencyProvider } from "./StorefrontCurrencyProvider";
import { getStorefrontMoneyContext } from "@/utils/server/storefront-currency";

interface AppWrapperProps {
  children: React.ReactNode;
  className?: string;
}

async function AppWrapper({ children }: AppWrapperProps) {
  // Missing metadata must not relabel an amount or make the entire shop fail.
  const money = await getStorefrontMoneyContext().catch(() => null);
  return (
        <StorefrontCurrencyProvider currencyCode={money?.currencyCode ?? null} locale={money?.locale}>
          <MainProvider>
            {children}
          </MainProvider>
        </StorefrontCurrencyProvider>
  );
}

export { AppWrapper };
