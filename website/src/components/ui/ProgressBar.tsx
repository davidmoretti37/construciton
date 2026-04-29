import { cn } from "@/lib/cn";

interface Props {
  value: number;
  max?: number;
  showLabel?: boolean;
  className?: string;
  trackClassName?: string;
  fillClassName?: string;
}

export default function ProgressBar({
  value,
  max = 100,
  showLabel = false,
  className = "",
  trackClassName = "",
  fillClassName = "",
}: Props) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "flex-1 h-1.5 bg-[#f5f5f7] rounded-full overflow-hidden",
          trackClassName
        )}
      >
        <div
          className={cn(
            "h-full bg-[#0071e3] rounded-full transition-[width] duration-500 ease-out",
            fillClassName
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="font-mono text-[12px] text-[#6e6e73] tabular-nums shrink-0">
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
