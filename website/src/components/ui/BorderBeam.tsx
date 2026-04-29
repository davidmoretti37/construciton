import { cn } from "@/lib/cn";

interface Props {
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  className?: string;
  borderRadius?: number;
  borderWidth?: number;
}

export default function BorderBeam({
  duration = 8,
  colorFrom = "#0071e3",
  colorTo = "#34c759",
  className = "",
  borderRadius = 16,
  borderWidth = 1.5,
}: Props) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{
        borderRadius,
        padding: borderWidth,
        background: `conic-gradient(from var(--beam-angle, 0deg) at 50% 50%, transparent 0deg, ${colorFrom} 60deg, ${colorTo} 120deg, transparent 180deg, transparent 360deg)`,
        WebkitMask:
          "linear-gradient(white, white) content-box, linear-gradient(white, white)",
        WebkitMaskComposite: "xor",
        mask: "linear-gradient(white, white) content-box, linear-gradient(white, white)",
        maskComposite: "exclude",
        animation: `beam-rotate ${duration}s linear infinite`,
      }}
    />
  );
}
