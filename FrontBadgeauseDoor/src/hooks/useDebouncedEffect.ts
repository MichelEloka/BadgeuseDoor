import { useEffect } from "react";

export function useDebouncedEffect(effect: () => void, deps: any[], delay = 700) {
  useEffect(() => {
    const t = setTimeout(effect, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

