import { cn } from "@/lib/cn";

type Variant =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

const STYLES: Record<Variant, string> = {
  neutral: "bg-[#f5f5f7] text-[#6e6e73]",
  info: "bg-[#0071e3]/10 text-[#0071e3]",
  accent: "bg-[#0071e3]/10 text-[#0071e3]",
  success: "bg-[#34c759]/10 text-[#1d8a3a]",
  warning: "bg-[#ff9500]/10 text-[#a35a00]",
  danger: "bg-[#ff3b30]/10 text-[#c5251c]",
};

const STATUS_MAP: Record<string, Variant> = {
  active: "info",
  in_progress: "info",
  "in-progress": "info",
  on_track: "success",
  "on-track": "success",
  completed: "success",
  done: "success",
  paid: "success",
  accepted: "success",
  on_hold: "warning",
  "on-hold": "warning",
  paused: "warning",
  behind: "warning",
  partial: "warning",
  draft: "neutral",
  archived: "neutral",
  cancelled: "neutral",
  planning: "accent",
  sent: "info",
  unpaid: "danger",
  overdue: "danger",
  "over-budget": "danger",
};

interface Props {
  variant?: Variant;
  status?: string;
  children?: React.ReactNode;
  className?: string;
}

export default function StatusBadge({ variant, status, children, className = "" }: Props) {
  const v = variant ?? (status ? STATUS_MAP[status] ?? "neutral" : "neutral");
  const label = children ?? (status ? status.replace(/[_-]/g, " ") : "");
  return (
    <span
      className={cn(
        "inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium capitalize whitespace-nowrap",
        STYLES[v],
        className
      )}
    >
      {label}
    </span>
  );
}
