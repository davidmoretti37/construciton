import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";

interface Props {
  amountCents: number;
  className?: string;
}

export default function AmountPill({ amountCents, className }: Props) {
  const isCredit = amountCents > 0;
  const isDebit = amountCents < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end font-mono font-medium tabular-nums text-[13px] tracking-tight",
        isCredit && "text-[#1d8a3a]",
        isDebit && "text-[#1d1d1f]",
        !isCredit && !isDebit && "text-[#86868b]",
        className,
      )}
    >
      {formatCents(amountCents, { signed: true })}
    </span>
  );
}
