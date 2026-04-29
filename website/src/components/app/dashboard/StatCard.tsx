import { cn } from "@/lib/cn";

type DeltaTone = "positive" | "negative" | "neutral";

interface Props {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: { value: string; tone?: DeltaTone };
  children?: React.ReactNode;
  className?: string;
  href?: string;
}

const deltaStyles: Record<DeltaTone, string> = {
  positive: "bg-[#34c759]/10 text-[#1d8a3a]",
  negative: "bg-[#ff3b30]/10 text-[#c5251c]",
  neutral: "bg-[#f5f5f7] text-[#6e6e73]",
};

export default function StatCard({
  label,
  value,
  sub,
  delta,
  children,
  className = "",
}: Props) {
  return (
    <div
      className={cn(
        "bg-white ring-1 ring-[#e5e5ea] rounded-2xl p-5",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]",
        "hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_4px_8px_rgba(0,0,0,0.06),0_8px_16px_rgba(0,0,0,0.04)]",
        "transition-shadow duration-200",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
          {label}
        </span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center h-5 px-1.5 rounded-full text-[10px] font-medium font-mono tabular-nums",
              deltaStyles[delta.tone ?? "neutral"]
            )}
          >
            {delta.value}
          </span>
        )}
      </div>
      <p className="mt-2 font-mono text-[32px] font-semibold tabular-nums leading-none text-[#1d1d1f]">
        {value}
      </p>
      {sub && (
        <p className="mt-1.5 text-[12px] text-[#6e6e73]">{sub}</p>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
