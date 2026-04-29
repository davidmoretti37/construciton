import { cn } from "@/lib/cn";

interface Props {
  className?: string;
  width?: string | number;
  height?: string | number;
}

export default function Skeleton({ className = "", width, height }: Props) {
  return (
    <div
      className={cn("bg-[#f5f5f7] rounded-[8px] animate-pulse", className)}
      style={{ width, height }}
    />
  );
}
