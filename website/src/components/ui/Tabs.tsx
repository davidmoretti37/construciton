"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
  href?: string;
  count?: number;
}

interface Props {
  items: TabItem[];
  active?: string;
  onChange?: (key: string) => void;
  variant?: "pill" | "underline";
  className?: string;
}

export default function Tabs({
  items,
  active,
  onChange,
  variant = "pill",
  className = "",
}: Props) {
  const pathname = usePathname() ?? "";

  function isActive(it: TabItem): boolean {
    if (active !== undefined) return active === it.key;
    if (it.href) {
      if (it.href === pathname) return true;
      return pathname.startsWith(it.href + "/") || pathname.startsWith(it.href);
    }
    return false;
  }

  if (variant === "underline") {
    return (
      <div className={cn("flex items-center gap-6 border-b border-[#e5e5ea]", className)}>
        {items.map((it) => {
          const a = isActive(it);
          const cls = cn(
            "relative pb-3 text-[13px] font-medium transition-colors",
            a ? "text-[#1d1d1f]" : "text-[#6e6e73] hover:text-[#1d1d1f]"
          );
          const indicator = a && (
            <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[#0071e3]" />
          );
          if (it.href) {
            return (
              <Link key={it.key} href={it.href} className={cls}>
                {it.label}
                {indicator}
              </Link>
            );
          }
          return (
            <button
              key={it.key}
              type="button"
              className={cls}
              onClick={() => onChange?.(it.key)}
            >
              {it.label}
              {indicator}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center bg-white ring-1 ring-[#e5e5ea] rounded-full p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className
      )}
    >
      {items.map((it) => {
        const a = isActive(it);
        const cls = cn(
          "inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-[13px] font-medium transition-all duration-200",
          a
            ? "bg-[#0071e3] text-white shadow-[0_1px_2px_rgba(0,113,227,0.30)]"
            : "text-[#6e6e73] hover:text-[#1d1d1f]"
        );
        const inner = (
          <>
            {it.label}
            {typeof it.count === "number" && (
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums",
                  a ? "text-white/75" : "text-[#86868b]"
                )}
              >
                {it.count}
              </span>
            )}
          </>
        );
        if (it.href) {
          return (
            <Link key={it.key} href={it.href} className={cls}>
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange?.(it.key)}
            className={cls}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
