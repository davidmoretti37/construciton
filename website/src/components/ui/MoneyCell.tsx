import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";

interface Props {
  amount: number;
  secondary?: number;
  secondaryLabel?: string;
  currency?: string;
  className?: string;
}

export default function MoneyCell({
  amount,
  secondary,
  secondaryLabel = "collected",
  className = "",
}: Props) {
  return (
    <div className={cn("flex flex-col items-end leading-tight", className)}>
      <span className="font-mono text-[13px] text-[#1d1d1f] tabular-nums">
        {formatCurrency(amount, { whole: true })}
      </span>
      {secondary !== undefined && secondary > 0 && (
        <span className="text-[11px] text-[#86868b] font-mono tabular-nums">
          {formatCurrency(secondary, { whole: true })} {secondaryLabel}
        </span>
      )}
    </div>
  );
}
