"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { portalFetch } from "@/lib/portal-api";

interface PortalClient {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  owner_id: string;
}

interface PortalAuthContextType {
  client: PortalClient | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextType | null>(null);

export function usePortalAuth() {
  const context = useContext(PortalAuthContext);
  if (!context) {
    return {
      client: null,
      isLoading: true,
      isAuthenticated: false,
      logout: async () => {},
      refresh: async () => {},
    };
  }
  return context;
}

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<PortalClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      // Cookie is sent automatically via credentials: 'include'
      const data = await portalFetch<{ client: PortalClient }>("/auth/check");
      setClient(data.client);
    } catch {
      setClient(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const logout = useCallback(async () => {
    try {
      await portalFetch("/auth/logout", { method: "POST" });
    } catch {
      // Ignore errors — clear local state regardless
    }
    setClient(null);
  }, []);

  return (
    <PortalAuthContext.Provider
      value={{
        client,
        isLoading,
        isAuthenticated: !!client,
        logout,
        refresh: checkSession,
      }}
    >
      {children}
    </PortalAuthContext.Provider>
  );
}
