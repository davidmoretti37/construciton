"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ToastVariant } from "@/types";
import { cn } from "@/lib/cn";

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface Toast extends ToastInput {
  id: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  toasts: Toast[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: () => "",
      dismiss: () => {},
      toasts: [],
    };
  }
  return ctx;
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  success: "border-green-200 bg-green-50 text-green-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const next: Toast = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? "info",
        durationMs: input.durationMs ?? 4000,
      };
      setToasts((prev) => [...prev, next]);
      if (next.durationMs > 0) {
        const timer = setTimeout(() => dismiss(id), next.durationMs);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss, toasts }), [toast, dismiss, toasts]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto rounded-xl border px-4 py-3 shadow-md transition-all",
              VARIANT_STYLES[t.variant]
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.description && (
                  <p className="mt-1 text-xs opacity-80">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded p-1 text-xs opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
