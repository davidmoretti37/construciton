"use client";

import { cn } from "@/lib/cn";
import EmptyState from "@/components/ui/EmptyState";

export interface RailItem {
  id: string;
  primary: string;
  meta?: string;
  href?: string;
}

export interface RailSection {
  key: string;
  title: string;
  items: RailItem[];
  emptyMessage: string;
  emptyIcon?: "calendar" | "inbox" | "message" | "money";
}

interface Props {
  sections: RailSection[];
  className?: string;
}

export default function TodayRail({ sections, className = "" }: Props) {
  return (
    <aside
      className={cn(
        "bg-white ring-1 ring-[#e5e5ea] rounded-2xl divide-y divide-[#e5e5ea]",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]",
        className
      )}
    >
      {sections.map((section) => (
        <div key={section.key}>
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#1d1d1f]">{section.title}</span>
            <span className="bg-[#f5f5f7] text-[#6e6e73] rounded-full px-2 py-0.5 text-[11px] font-mono tabular-nums">
              {section.items.length}
            </span>
          </div>
          {section.items.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={section.emptyIcon ?? "inbox"}
              message={section.emptyMessage}
              className="pt-1 pb-4"
            />
          ) : (
            <ul>
              {section.items.map((item) => {
                const content = (
                  <>
                    <span className="text-[13px] text-[#1d1d1f] flex-1 min-w-0 truncate">
                      {item.primary}
                    </span>
                    {item.meta && (
                      <span className="text-[12px] text-[#86868b] font-mono tabular-nums shrink-0">
                        {item.meta}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.href ? (
                      <a
                        href={item.href}
                        className="px-4 py-2.5 flex items-start gap-3 hover:bg-[#fbfbfd] transition-colors"
                      >
                        {content}
                      </a>
                    ) : (
                      <div className="px-4 py-2.5 flex items-start gap-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </aside>
  );
}
