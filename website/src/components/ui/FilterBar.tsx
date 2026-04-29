"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { DensityMode } from "@/types";

export interface FilterChip {
  key: string;
  label: string;
  count?: number;
}

interface Props {
  chips: FilterChip[];
  active: string;
  onChange: (key: string) => void;
  search?: string;
  onSearch?: (q: string) => void;
  searchPlaceholder?: string;
  density?: DensityMode;
  onDensityChange?: (d: DensityMode) => void;
  right?: React.ReactNode;
  className?: string;
}

export default function FilterBar({
  chips,
  active,
  onChange,
  search,
  onSearch,
  searchPlaceholder = "Search…",
  density,
  onDensityChange,
  right,
  className = "",
}: Props) {
  const [local, setLocal] = useState(search ?? "");
  const debounced = useDebouncedValue(local, 200);

  useEffect(() => {
    if (onSearch) onSearch(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const isActive = chip.key === active;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange(chip.key)}
              className={cn(
                "inline-flex items-center h-8 px-3.5 rounded-full text-[13px] font-medium",
                "transition-all duration-200 active:scale-[0.97]",
                isActive
                  ? "bg-[#1d1d1f] text-white"
                  : "bg-white text-[#1d1d1f] ring-1 ring-[#e5e5ea] hover:ring-[#d2d2d7]"
              )}
            >
              {chip.label}
              {typeof chip.count === "number" && (
                <span
                  className={cn(
                    "ml-1.5 font-mono text-[11px] tabular-nums",
                    isActive ? "text-white/70" : "text-[#86868b]"
                  )}
                >
                  {chip.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {onSearch && (
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-white ring-1 ring-[#e5e5ea] focus:ring-2 focus:ring-[#0071e3] rounded-[10px] h-9 pl-9 pr-3 text-[13px] placeholder:text-[#86868b] focus:outline-none transition-shadow"
          />
        </div>
      )}

      {density && onDensityChange && (
        <div className="inline-flex bg-white ring-1 ring-[#e5e5ea] rounded-[10px] p-0.5 h-9">
          {(["compact", "comfortable"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDensityChange(d)}
              className={cn(
                "h-8 px-3 rounded-[8px] text-[12px] font-medium transition-colors capitalize",
                density === d ? "bg-[#f5f5f7] text-[#1d1d1f]" : "text-[#86868b] hover:text-[#1d1d1f]"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}
