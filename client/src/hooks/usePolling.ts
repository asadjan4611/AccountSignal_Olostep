import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../services/api";

/**
 * Load data, then keep refreshing it every `intervalMs` while `active(data)` is true.
 *
 * - Pauses while the tab is hidden and refreshes as soon as it's visible again.
 * - Keeps the last good data when a refresh fails, and backs off (up to 15s) while the
 *   server is unreachable, so a brief blip shows "Reconnecting…" instead of an error page.
 * - Progress always comes from the backend; nothing is simulated.
 */
export function usePolling<T>(
  load: () => Promise<T>,
  {
    intervalMs = 2_000,
    active = () => false,
    key = "",
  }: { intervalMs?: number; active?: (data: T) => boolean; key?: string } = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const loadRef = useRef(load);
  const activeRef = useRef(active);
  const failuresRef = useRef(0);
  loadRef.current = load;
  activeRef.current = active;

  // A new key (e.g. another run id) starts from a clean slate.
  useEffect(() => {
    setData(null);
    setError(null);
    setFailures(0);
    failuresRef.current = 0;
  }, [key]);

  const refresh = useCallback(async () => {
    try {
      const next = await loadRef.current();
      setData(next);
      setError(null);
      failuresRef.current = 0;
      setFailures(0);
      return next;
    } catch (err) {
      setError(errorMessage(err, "Request failed"));
      failuresRef.current += 1;
      setFailures(failuresRef.current);
      return null;
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let last: T | null = null;
    const schedule = (ms: number) => {
      timer = setTimeout(() => {
        timer = null;
        void tick();
      }, ms);
    };
    const tick = async () => {
      if (document.hidden) return; // resumed by visibilitychange
      const next = await refresh();
      if (stopped) return;
      if (next !== null) last = next;
      if (next === null) {
        // Back off while failing: 2s, 4s, 8s … capped at 15s.
        schedule(Math.min(15_000, intervalMs * 2 ** Math.min(failuresRef.current, 4)));
      } else if (activeRef.current(next)) {
        schedule(intervalMs);
      }
    };
    void tick();
    const onVisible = () => {
      if (document.hidden || timer || stopped) return;
      if (last === null || activeRef.current(last)) void tick();
    };
    const onOnline = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      onVisible();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh, intervalMs, key]);

  return {
    data,
    error,
    refresh,
    /** We have data, but the latest refreshes failed. */
    reconnecting: data !== null && failures > 0,
  };
}
