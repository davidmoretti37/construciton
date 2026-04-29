import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  prefixIcon?: React.ReactNode;
};

const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className = "", invalid, prefixIcon, ...rest },
  ref
) {
  if (prefixIcon) {
    return (
      <div className={cn("relative", className)}>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]">
          {prefixIcon}
        </span>
        <input
          ref={ref}
          className={cn(
            "w-full bg-white text-[#1d1d1f] placeholder:text-[#86868b]",
            "ring-1 ring-inset rounded-[10px] h-10 pl-9 pr-3 text-[14px]",
            "transition-shadow focus:outline-none focus:ring-2 focus:ring-[#0071e3]",
            invalid ? "ring-[#ff3b30]" : "ring-[#e5e5ea]"
          )}
          {...rest}
        />
      </div>
    );
  }
  return (
    <input
      ref={ref}
      className={cn(
        "w-full bg-white text-[#1d1d1f] placeholder:text-[#86868b]",
        "ring-1 ring-inset rounded-[10px] h-10 px-3 text-[14px]",
        "transition-shadow focus:outline-none focus:ring-2 focus:ring-[#0071e3]",
        invalid ? "ring-[#ff3b30]" : "ring-[#e5e5ea]",
        className
      )}
      {...rest}
    />
  );
});

export default Input;
