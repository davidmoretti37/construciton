import { cn } from "@/lib/cn";

interface Props {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export default function ErrorBanner({ message, onRetry, className = "" }: Props) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center justify-between gap-3",
        "bg-[#ff3b30]/[0.06] ring-1 ring-[#ff3b30]/30 text-[#c5251c]",
        "rounded-[10px] px-4 py-3 text-[13px]",
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span className="truncate">{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-[12px] font-medium underline decoration-[#ff3b30]/40 hover:decoration-[#c5251c]"
        >
          Retry
        </button>
      )}
    </div>
  );
}
