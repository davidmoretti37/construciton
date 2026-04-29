"use client";

import { cn } from "@/lib/cn";

export type ValidationLevel = "valid" | "warn" | "error" | "empty";

export interface WizardSection {
  id: string;
  label: string;
  validation: ValidationLevel;
}

interface Props {
  sections: WizardSection[];
  active: string;
  onSelect: (id: string) => void;
  className?: string;
}

const dotStyles: Record<ValidationLevel, string> = {
  valid: "bg-[#34c759]",
  warn: "bg-[#ff9500]",
  error: "bg-[#ff3b30]",
  empty: "bg-[#d2d2d7]",
};

export default function WizardTOC({ sections, active, onSelect, className = "" }: Props) {
  return (
    <nav className={cn("space-y-1", className)} aria-label="Wizard sections">
      {sections.map((section, idx) => {
        const isActive = section.id === active;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={(e) => {
              e.preventDefault();
              onSelect(section.id);
              const el = document.getElementById(section.id);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={cn(
              "flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-r-[10px] transition-colors",
              isActive
                ? "bg-[#0071e3]/[0.08] text-[#0071e3] border-l-2 border-[#0071e3]"
                : "text-[#6e6e73] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] border-l-2 border-transparent"
            )}
          >
            <span className="font-mono text-[12px] tabular-nums w-5 shrink-0">
              {String(idx + 1).padStart(2, "0")}
            </span>
            <span className="text-[13px] font-medium flex-1 min-w-0">{section.label}</span>
            <span
              className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotStyles[section.validation])}
              aria-hidden
            />
          </a>
        );
      })}
    </nav>
  );
}
