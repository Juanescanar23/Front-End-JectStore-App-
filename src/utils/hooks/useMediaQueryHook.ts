import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string) {
  const subscribe = (callback: () => void) => {
    const media = window.matchMedia(query);

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", callback);

      return () => media.removeEventListener("change", callback);
    }

    media.addListener(callback);

    return () => media.removeListener(callback);
  };

  const getSnapshot = () => {
    return window.matchMedia(query).matches;
  };

  const getServerSnapshot = () => {
    return false;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
