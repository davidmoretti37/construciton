import { cn } from "@/lib/cn";

interface Props extends React.LabelHTMLAttributes<HTMLLabelElement> {
  optional?: boolean;
  children: React.ReactNode;
}

export default function Label({ optional, className = "", children, ...rest }: Props) {
  return (
    <label
      className={cn(
        "text-[13px] font-medium text-[#1d1d1f] mb-1.5 block",
        className
      )}
      {...rest}
    >
      {children}
      {optional && <span className="text-[#86868b] ml-1 font-normal">optional</span>}
    </label>
  );
}
