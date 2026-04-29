import { cn } from "@/lib/cn";

interface Props {
  size?: number;
  className?: string;
}

export default function DotPattern({ size = 24, className = "" }: Props) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><circle cx='1' cy='1' r='1' fill='%231d1d1f' fill-opacity='0.5'/></svg>`;
  const url = `url("data:image/svg+xml;utf8,${svg}")`;
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none", className)}
      style={{
        backgroundImage: url,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  );
}
