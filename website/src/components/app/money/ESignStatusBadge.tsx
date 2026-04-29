import { cn } from "@/lib/cn";
import type { DbSignatureStatus } from "@/types/database";

const STYLES: Record<string, string> = {
  none: "bg-[#f5f5f7] text-[#86868b]",
  pending: "bg-[#ff9500]/10 text-[#a35a00]",
  signed: "bg-[#34c759]/10 text-[#1d8a3a]",
  declined: "bg-[#ff3b30]/10 text-[#c5251c]",
  expired: "bg-[#f5f5f7] text-[#6e6e73]",
};

const LABELS: Record<string, string> = {
  none: "Unsigned",
  pending: "Pending",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
};

interface Props {
  status?: DbSignatureStatus | "none" | null;
  className?: string;
}

export default function ESignStatusBadge({ status, className = "" }: Props) {
  const key = status && STYLES[status] ? status : "none";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full text-[11px] font-medium whitespace-nowrap",
        STYLES[key],
        className
      )}
    >
      <span
        className={cn(
          "inline-block w-1.5 h-1.5 rounded-full",
          key === "pending" && "bg-[#ff9500]",
          key === "signed" && "bg-[#34c759]",
          key === "declined" && "bg-[#ff3b30]",
          key === "expired" && "bg-[#a3a3a3]",
          key === "none" && "bg-[#a3a3a3]"
        )}
      />
      {LABELS[key]}
    </span>
  );
}
