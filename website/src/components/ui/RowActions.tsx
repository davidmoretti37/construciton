"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface RowAction {
  label?: string;
  onClick?: () => void;
  href?: string;
  separator?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  items: RowAction[];
  align?: "right" | "left";
  className?: string;
}

export default function RowActions({ items, align = "right", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <button
        type="button"
        aria-label="More actions"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-30 mt-1 min-w-[180px] bg-white ring-1 ring-[#e5e5ea] rounded-[10px]",
            "shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)]",
            "py-1",
            align === "right" ? "right-0" : "left-0"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) => {
            if (it.separator) {
              return <div key={`sep-${i}`} className="my-1 h-px bg-[#e5e5ea]" />;
            }
            const cls = cn(
              "block w-full text-left px-3 py-2 text-[13px] transition-colors",
              it.danger
                ? "text-[#c5251c] hover:bg-[#ff3b30]/[0.06]"
                : "text-[#1d1d1f] hover:bg-[#f5f5f7]",
              it.disabled && "opacity-50 cursor-not-allowed"
            );
            const onSelect = () => {
              if (it.disabled) return;
              setOpen(false);
              it.onClick?.();
            };
            if (it.href && !it.disabled) {
              return (
                <a key={i} href={it.href} className={cls} onClick={() => setOpen(false)}>
                  {it.label}
                </a>
              );
            }
            return (
              <button key={i} type="button" disabled={it.disabled} onClick={onSelect} className={cls}>
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
