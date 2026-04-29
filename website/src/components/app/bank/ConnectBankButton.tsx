"use client";

import { cn } from "@/lib/cn";
import Button from "@/components/ui/Button";

type Variant = "tile" | "button";

interface Props {
  onClick: () => void;
  variant?: Variant;
  disabled?: boolean;
  className?: string;
}

export default function ConnectBankButton({
  onClick,
  variant = "tile",
  disabled = false,
  className = "",
}: Props) {
  if (variant === "button") {
    return (
      <Button variant="primary" size="md" onClick={onClick} disabled={disabled}>
        <PlusIcon />
        Connect a bank account
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Connect a bank account"
      className={cn(
        "group snap-start shrink-0 min-w-[340px] w-[340px] min-h-[220px]",
        "rounded-2xl border-2 border-dashed border-[#d2d2d7]",
        "bg-[#fbfbfd]/60 hover:bg-[#0071e3]/[0.04]",
        "hover:border-[#0071e3]",
        "transition-colors duration-200",
        "flex flex-col items-center justify-center gap-3 px-6",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fafafa]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    >
      <span
        aria-hidden
        className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white ring-1 ring-[#e5e5ea] text-[#525252] group-hover:text-[#0071e3] group-hover:ring-[#0071e3]/30 transition-colors"
      >
        <PlusIcon />
      </span>
      <span className="text-[15px] font-medium text-[#171717]">
        Connect a bank account
      </span>
      <span className="text-[12px] text-[#a3a3a3] text-center max-w-[220px]">
        Pull balances and transactions from Teller or Plaid
      </span>
    </button>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
