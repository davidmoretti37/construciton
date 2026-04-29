import { cn } from "@/lib/cn";
import { matchPillVariant } from "@/lib/reconciliation";
import { MATCH_STATUS_LABEL } from "@/lib/constants";
import type { BankTransactionMatchStatus } from "@/types";

const STYLES: Record<string, string> = {
  success: "bg-[#34c759]/10 text-[#1d8a3a] ring-[#34c759]/20",
  warning: "bg-[#ff9500]/10 text-[#a35a00] ring-[#ff9500]/20",
  danger: "bg-[#ff3b30]/10 text-[#c5251c] ring-[#ff3b30]/20",
  neutral: "bg-[#f5f5f7] text-[#6e6e73] ring-[#e5e5ea]",
  info: "bg-[#0071e3]/10 text-[#0071e3] ring-[#0071e3]/20",
  accent: "bg-[#0071e3]/10 text-[#0071e3] ring-[#0071e3]/20",
};

interface Props {
  status: BankTransactionMatchStatus;
  confidence?: number | null;
  showConfidence?: boolean;
  className?: string;
}

export default function MatchPill({ status, confidence, showConfidence = true, className }: Props) {
  const variant = matchPillVariant(status, confidence ?? null);
  const label = MATCH_STATUS_LABEL[status];
  const pct =
    typeof confidence === "number" && Number.isFinite(confidence)
      ? Math.round(Math.max(0, Math.min(1, confidence)) * 100)
      : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "text-[12px] font-medium ring-1",
        STYLES[variant] ?? STYLES.neutral,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          variant === "success" && "bg-[#34c759]",
          variant === "warning" && "bg-[#ff9500]",
          variant === "danger" && "bg-[#ff3b30]",
          variant === "neutral" && "bg-[#a3a3a3]",
          (variant === "info" || variant === "accent") && "bg-[#0071e3]",
        )}
      />
      <span>{label}</span>
      {showConfidence && pct !== null && status !== "ignored" && (
        <span className="font-mono tabular-nums opacity-70">{pct}%</span>
      )}
    </span>
  );
}
