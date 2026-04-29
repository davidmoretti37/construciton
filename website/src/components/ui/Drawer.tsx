"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  side?: "right" | "left";
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export default function Drawer({
  open,
  onClose,
  title,
  description,
  side = "right",
  width = 520,
  children,
  footer,
  className = "",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        "fixed inset-0 z-[60] transition-opacity duration-300",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute top-0 bottom-0 bg-white flex flex-col",
          "shadow-[0_8px_24px_rgba(0,0,0,0.08),0_24px_64px_rgba(0,0,0,0.12)]",
          "transition-transform duration-300 ease-out",
          side === "right" ? "right-0" : "left-0",
          open
            ? "translate-x-0"
            : side === "right"
              ? "translate-x-full"
              : "-translate-x-full",
          className
        )}
        style={{ width: `min(${width}px, 100vw)` }}
      >
        {(title || description) && (
          <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[#e5e5ea]">
            <div className="min-w-0">
              {title && (
                <h2 className="text-[18px] font-semibold tracking-tight text-[#1d1d1f]">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-[13px] text-[#6e6e73]">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-[8px] text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <footer className="border-t border-[#e5e5ea] px-6 py-4 bg-[#fbfbfd]">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
