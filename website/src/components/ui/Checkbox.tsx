"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  checked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
}

const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
  { checked = false, indeterminate = false, onCheckedChange, label, className, disabled, ...rest },
  ref,
) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 cursor-pointer select-none",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span className="relative inline-flex items-center justify-center">
        <input
          ref={(el) => {
            if (el) el.indeterminate = indeterminate;
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
          }}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          {...rest}
        />
        <span
          aria-hidden
          className={cn(
            "h-[18px] w-[18px] rounded-[5px] ring-1 ring-inset ring-black/15 bg-white",
            "transition-all duration-150",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-[#0071e3] peer-focus-visible:ring-offset-2",
            (checked || indeterminate) &&
              "bg-[#0071e3] ring-[#0071e3] shadow-[0_1px_2px_rgba(0,113,227,0.25)]",
          )}
        />
        {indeterminate ? (
          <svg
            aria-hidden
            className="pointer-events-none absolute h-3 w-3 text-white"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M3 6h6"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
        ) : checked ? (
          <svg
            aria-hidden
            className="pointer-events-none absolute h-3 w-3 text-white"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M2.5 6.5l2.4 2.4L9.5 3.5"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      {label && <span className="text-[13px] text-[#1d1d1f]">{label}</span>}
    </label>
  );
});

export default Checkbox;
