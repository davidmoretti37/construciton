"use client";

import { cn } from "@/lib/cn";
import type { ProjectTabKey, ProjectTabConfig } from "@/types";

interface Props {
  tabs: ProjectTabConfig[];
  active: ProjectTabKey;
  onChange: (key: ProjectTabKey) => void;
  className?: string;
}

export default function ProjectTabs({ tabs, active, onChange, className = "" }: Props) {
  return (
    <div
      className={cn(
        "sticky top-14 z-20 bg-[#fbfbfd]/85 backdrop-blur-md",
        "border-b border-[#e5e5ea]",
        className
      )}
    >
      <div className="flex gap-1 px-1 h-12 overflow-x-auto scrollbar-none">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={cn(
                "relative h-12 px-4 text-[13px] whitespace-nowrap transition-colors",
                isActive
                  ? "text-[#1d1d1f] font-medium"
                  : "text-[#6e6e73] hover:text-[#1d1d1f]"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "absolute left-2 right-2 bottom-0 h-0.5 rounded-full transition-all",
                  isActive ? "bg-[#0071e3]" : "bg-transparent"
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
