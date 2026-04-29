import { useId } from "react";
import { cn } from "@/lib/cn";

interface Props {
  data: number[];
  stroke?: string;
  fill?: string;
  height?: number;
  className?: string;
}

export default function Sparkline({
  data,
  stroke = "#0071e3",
  fill,
  height = 36,
  className = "",
}: Props) {
  const safe = data.length > 0 ? data : [0];
  const width = 120;
  const max = Math.max(...safe);
  const min = Math.min(...safe);
  const range = max - min || 1;

  const points = safe.map((v, i) => {
    const x = (i / Math.max(safe.length - 1, 1)) * width;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return [x, y] as const;
  });

  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1];
  const areaPath = `${path} L${width} ${height} L0 ${height} Z`;

  const reactId = useId();
  const gradId = `spark-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.20" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={fill ?? `url(#${gradId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {last && (
        <circle cx={last[0]} cy={last[1]} r="2" fill={stroke} />
      )}
    </svg>
  );
}
