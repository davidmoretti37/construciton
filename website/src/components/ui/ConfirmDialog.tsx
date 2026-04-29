"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";
import Button from "./Button";

type Tone = "default" | "danger";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  pending?: boolean;
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  pending = false,
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
        "fixed inset-0 z-[70] transition-opacity duration-200",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            "w-full max-w-[440px] bg-white rounded-2xl ring-1 ring-black/[0.06]",
            "shadow-[0_8px_24px_rgba(0,0,0,0.08),0_24px_64px_rgba(0,0,0,0.12)]",
            "transition-transform duration-200",
            open ? "translate-y-0" : "translate-y-2"
          )}
        >
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-start gap-3">
              {tone === "danger" && (
                <span
                  aria-hidden
                  className="shrink-0 mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#ff3b30]/[0.10] text-[#ff3b30]"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                </span>
              )}
              <div className="min-w-0">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[#171717]">
                  {title}
                </h2>
                {description && (
                  <p className="mt-1.5 text-[14px] leading-relaxed text-[#525252]">
                    {description}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-4">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
              {cancelLabel}
            </Button>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              size="sm"
              onClick={onConfirm}
              disabled={pending}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
