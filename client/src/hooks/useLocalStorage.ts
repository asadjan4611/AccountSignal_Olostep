import { useCallback, useState } from "react";

/** A small per-browser preference (view mode, etc.). Falls back to memory if storage is blocked. */
export function useLocalStorage<T extends string>(
  key: string,
  initial: T,
  allowed?: readonly T[],
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null;
      if (stored !== null && (!allowed || allowed.includes(stored))) return stored;
    } catch {
      // storage unavailable
    }
    return initial;
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // storage unavailable: keep it for this page only
      }
    },
    [key],
  );
  return [value, set];
}
