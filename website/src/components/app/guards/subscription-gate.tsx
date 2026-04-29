"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, ApiError } from "@/lib/api";
import type { CanCreateProjectResponse } from "@/types";

interface SubscriptionState {
  status: "idle" | "loading" | "ready" | "error";
  allowed: boolean;
  reason?: string;
  error?: string;
  refresh: () => void;
}

const SubscriptionContext = createContext<SubscriptionState | null>(null);

export function useSubscription(): SubscriptionState {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    return {
      status: "idle",
      allowed: false,
      refresh: () => {},
    };
  }
  return ctx;
}

interface Props {
  children: ReactNode;
}

export function SubscriptionGate({ children }: Props) {
  const { isLoading: authLoading, user, isOwner } = useAuth();
  const [status, setStatus] = useState<SubscriptionState["status"]>("idle");
  const [allowed, setAllowed] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const inflight = useRef(false);

  useEffect(() => {
    if (authLoading || !user || !isOwner) return;
    if (inflight.current) return;
    inflight.current = true;
    setStatus("loading");
    setError(undefined);

    apiFetch<CanCreateProjectResponse>("/api/stripe/can-create-project", {
      method: "GET",
    })
      .then((res) => {
        setAllowed(Boolean(res?.allowed));
        setReason(res?.reason);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          const body = err.body as Partial<CanCreateProjectResponse> | null;
          setAllowed(Boolean(body?.allowed));
          setReason(body?.reason ?? err.message);
          setError(err.message);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load subscription");
        }
        setStatus("error");
      })
      .finally(() => {
        inflight.current = false;
      });
  }, [authLoading, user, isOwner, tick]);

  const refresh = () => setTick((n) => n + 1);

  const value: SubscriptionState = {
    status,
    allowed,
    reason,
    error,
    refresh,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}
