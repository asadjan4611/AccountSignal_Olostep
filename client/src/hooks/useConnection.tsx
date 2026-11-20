import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Connection } from "../lib/types";
import { api, errorMessage } from "../services/api";

interface ConnectionState {
  connection: Connection | null;
  checking: boolean;
  /** Check the key again (free: Olostep's credits endpoint). */
  recheck: () => Promise<Connection | null>;
}

const ConnectionContext = createContext<ConnectionState>({
  connection: null,
  checking: false,
  recheck: () => Promise.resolve(null),
});

export const useConnection = () => useContext(ConnectionContext);

export function ConnectionProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [checking, setChecking] = useState(false);

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      const next = await api.connection();
      setConnection(next);
      return next;
    } catch (err) {
      const failed: Connection = {
        configured: true,
        ok: false,
        demo_available: true,
        message: errorMessage(err, "Could not check the API key."),
      };
      setConnection(failed);
      return failed;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void recheck();
    else
      setConnection({
        configured: false,
        ok: false,
        demo_available: true,
        message: "No OLOSTEP_API_KEY set: demo mode only.",
      });
  }, [enabled, recheck]);

  return (
    <ConnectionContext.Provider value={{ connection, checking, recheck }}>
      {children}
    </ConnectionContext.Provider>
  );
}
