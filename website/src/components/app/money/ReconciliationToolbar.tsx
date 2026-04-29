"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface Props {
  selectedCount: number;
  totalCents: number;
  pending: boolean;
  onBulkMatch: (projectId: string) => void;
  onBulkIgnore: () => void;
  onClear: () => void;
  className?: string;
}

export default function ReconciliationToolbar({
  selectedCount,
  totalCents,
  pending,
  onBulkMatch,
  onBulkIgnore,
  onClear,
  className,
}: Props) {
  const [projectInput, setProjectInput] = useState("");
  const visible = selectedCount > 0;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="toolbar"
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "sticky top-2 z-20 mb-4",
            "bg-white/90 backdrop-blur-xl ring-1 ring-[#e5e5ea] rounded-[14px]",
            "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)]",
            "px-4 py-3",
            className,
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex items-center justify-center h-7 min-w-[28px] px-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold font-mono tabular-nums">
                {selectedCount}
              </span>
              <span className="text-[13px] font-medium text-[#1d1d1f]">
                selected
              </span>
              <span className="hidden md:inline-block h-4 w-px bg-[#e5e5ea]" />
              <span className="hidden md:inline-flex items-center gap-1 text-[12px] text-[#6e6e73]">
                <span>net</span>
                <span className="font-mono tabular-nums text-[#1d1d1f]">
                  {(totalCents / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })}
                </span>
              </span>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={projectInput}
                  onChange={(e) => setProjectInput(e.target.value)}
                  placeholder="Project ID for bulk match"
                  className="h-9 w-44 rounded-[10px] bg-white ring-1 ring-inset ring-black/10 px-3 text-[13px] placeholder:text-[#86868b] focus:ring-2 focus:ring-[#0071e3] focus:outline-none transition-shadow"
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={pending || !projectInput.trim()}
                  onClick={() => {
                    onBulkMatch(projectInput.trim());
                    setProjectInput("");
                  }}
                >
                  Match {selectedCount}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={onBulkIgnore}
              >
                Ignore
              </Button>
              <button
                type="button"
                onClick={onClear}
                disabled={pending}
                className="inline-flex items-center justify-center h-9 px-3 rounded-[10px] text-[13px] font-medium text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
