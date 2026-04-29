"use client";

import type { ReactNode } from "react";
import { motion, type Variants } from "framer-motion";
import DotPattern from "@/components/ui/DotPattern";
import StatusBadge from "@/components/ui/StatusBadge";
import StatCard from "@/components/app/dashboard/StatCard";
import { cn } from "@/lib/cn";

export interface CockpitHeroStat {
  key: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: { value: string; tone?: "positive" | "negative" | "neutral" };
}

interface Props {
  eyebrow: string;
  headline: string;
  subheadline?: string;
  stats?: CockpitHeroStat[];
  loading?: boolean;
  trailing?: ReactNode;
  className?: string;
}

const fadeUp = (delay: number): Variants => ({
  hidden: { y: 12, opacity: 0 },
  show: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay },
  },
});

const wordContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.2 } },
};

const wordReveal: Variants = {
  hidden: { y: "105%", opacity: 0 },
  show: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

const statReveal = (delay: number): Variants => ({
  hidden: { y: 18, opacity: 0 },
  show: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay },
  },
});

export default function CockpitHero({
  eyebrow,
  headline,
  subheadline,
  stats,
  loading = false,
  trailing,
  className,
}: Props) {
  const words = headline.split(" ");
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden",
        "min-h-[40vh] px-8 py-12 -mx-4 md:-mx-6 lg:-mx-8",
        "grid grid-cols-12 gap-6",
        className
      )}
    >
      {/* Atmosphere 1 — accent gradient blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 -z-10 h-[700px] w-[700px] rounded-full blur-[140px]"
        style={{ background: "rgba(0,113,227,0.08)" }}
      />

      {/* Atmosphere 2 — DotPattern with radial mask */}
      <DotPattern
        size={28}
        className="absolute inset-0 -z-10 opacity-[0.12]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent, var(--bg-canvas) 70%)",
        }}
      />

      {/* Eyebrow */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={fadeUp(0.1)}
        className="col-span-12"
      >
        <StatusBadge variant="accent" className="uppercase tracking-[0.08em]">
          {eyebrow}
        </StatusBadge>
      </motion.div>

      {/* Headline */}
      <motion.h1
        initial="hidden"
        animate="show"
        variants={wordContainer}
        className={cn(
          "col-span-12 md:col-span-9",
          "text-[44px] font-semibold tracking-[-0.03em] text-[#171717] leading-[1.05]"
        )}
      >
        {words.map((word, i) => (
          <span
            key={`${word}-${i}`}
            className="relative inline-block overflow-hidden align-bottom mr-[0.22em] last:mr-0"
          >
            <motion.span variants={wordReveal} className="inline-block">
              {word}
            </motion.span>
          </span>
        ))}
      </motion.h1>

      {/* Subheadline + trailing slot */}
      {(subheadline || trailing) && (
        <div className="col-span-12 md:col-span-9 -mt-2 flex items-end justify-between gap-6">
          {subheadline && (
            <motion.p
              initial="hidden"
              animate="show"
              variants={fadeUp(0.4)}
              className="text-[17px] text-[#525252] leading-relaxed max-w-[620px] mt-3"
            >
              {subheadline}
            </motion.p>
          )}
          {trailing && (
            <motion.div
              initial="hidden"
              animate="show"
              variants={fadeUp(0.5)}
              className="hidden md:block shrink-0"
            >
              {trailing}
            </motion.div>
          )}
        </div>
      )}

      {/* Reconciliation summary — 4 StatCards */}
      {stats && stats.length > 0 && (
        <div className="col-span-12 mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) =>
            loading ? (
              <div
                key={stat.key}
                aria-hidden
                className={cn(
                  "h-[112px] rounded-2xl bg-white ring-1 ring-black/[0.05]",
                  "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]",
                  "animate-pulse"
                )}
              />
            ) : (
              <motion.div
                key={stat.key}
                initial="hidden"
                animate="show"
                variants={statReveal(0.55 + i * 0.08)}
              >
                <StatCard
                  label={stat.label}
                  value={stat.value}
                  sub={stat.sub}
                  delta={stat.delta}
                />
              </motion.div>
            )
          )}
        </div>
      )}

      {/* Divider — gradient line */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.95 }}
        aria-hidden
        className="col-span-12 mt-2 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent"
      />
    </section>
  );
}
