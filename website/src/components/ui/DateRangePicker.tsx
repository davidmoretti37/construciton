"use client";

import { cn } from "@/lib/cn";

interface Props {
  startName?: string;
  endName?: string;
  startValue?: string;
  endValue?: string;
  onStartChange?: (v: string) => void;
  onEndChange?: (v: string) => void;
  className?: string;
}

function diffWorkingDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return 0;
  let days = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export default function DateRangePicker({
  startName = "start_date",
  endName = "end_date",
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  className = "",
}: Props) {
  const days = diffWorkingDays(startValue ?? "", endValue ?? "");
  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="block text-[12px] text-[#86868b] mb-1">Start</span>
          <input
            type="date"
            name={startName}
            value={startValue ?? ""}
            onChange={(e) => onStartChange?.(e.target.value)}
            className="w-full bg-white text-[#1d1d1f] ring-1 ring-inset ring-[#e5e5ea] focus:ring-2 focus:ring-[#0071e3] rounded-[10px] h-10 px-3 text-[14px] focus:outline-none transition-shadow"
          />
        </div>
        <div>
          <span className="block text-[12px] text-[#86868b] mb-1">End</span>
          <input
            type="date"
            name={endName}
            value={endValue ?? ""}
            onChange={(e) => onEndChange?.(e.target.value)}
            min={startValue || undefined}
            className="w-full bg-white text-[#1d1d1f] ring-1 ring-inset ring-[#e5e5ea] focus:ring-2 focus:ring-[#0071e3] rounded-[10px] h-10 px-3 text-[14px] focus:outline-none transition-shadow"
          />
        </div>
      </div>
      {days > 0 && (
        <p className="text-[12px] text-[#6e6e73]">
          <span className="font-mono tabular-nums">{days}</span> working day{days === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
