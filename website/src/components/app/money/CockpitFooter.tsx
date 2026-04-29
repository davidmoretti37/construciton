"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatRelativeDays } from "@/lib/format";

interface Props {
  lastSyncedAt?: string | Date | null;
  meta?: ReactNode;
  className?: string;
}

/**
 * In-page footer for the cockpit (`/app/*`).
 *
 * Per ARIA: AppShell handles chrome, so this is just a gradient-line connector
 * with optional meta text. It is intentionally quiet — three text levels are
 * preserved by the muted color and tabular numerics on the timestamp.
 */
export default function CockpitFooter({ lastSyncedAt, meta, className }: Props) {
  const synced =
    lastSyncedAt != null && lastSyncedAt !== ""
      ? formatRelativeDays(lastSyncedAt)
      : null;

  return (
    <footer className={cn("mt-16", className)}>
      <div
        aria-hidden
        className="h-px bg-gradient-to-r from-transparent via-black/10 to-transparent"
      />
      <div className="mt-6 flex items-center justify-between gap-4 text-[12px] text-[#a3a3a3]">
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#34c759]" aria-hidden />
          {synced ? (
            <span>
              Last sync{" "}
              <span className="font-mono tabular-nums text-[#525252]">{synced}</span>
            </span>
          ) : (
            <span>All systems operational</span>
          )}
        </span>
        {meta && <span className="font-mono tabular-nums">{meta}</span>}
      </div>
    </footer>
  );
}
