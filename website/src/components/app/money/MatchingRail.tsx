"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import StatusBadge from "@/components/ui/StatusBadge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { formatCents, formatDate } from "@/lib/format";
import type { StoredBankTransaction } from "@/app/actions/reconciliation";

export interface MatchSuggestion {
  projectId: string;
  confidence: number;
  reason: string;
}

interface Props {
  focused: StoredBankTransaction | null;
  transactions: StoredBankTransaction[];
  onApply: (transactionId: string, projectId: string) => void;
  onIgnore: (transactionId: string) => void;
  onSplit: (transactionId: string) => void;
  pending: boolean;
}

const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "inc", "llc", "co"]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function similarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

function buildSuggestions(
  focused: StoredBankTransaction,
  history: StoredBankTransaction[],
): MatchSuggestion[] {
  const matched = history.filter((t) => t.matchStatus === "matched" && t.matchedProjectId);
  const byProject = new Map<string, { hits: number; sim: number; latest: string }>();
  for (const tx of matched) {
    const pid = tx.matchedProjectId!;
    const sim = similarity(focused.description, tx.description);
    const cur = byProject.get(pid) ?? { hits: 0, sim: 0, latest: tx.occurredAt };
    cur.hits += 1;
    cur.sim = Math.max(cur.sim, sim);
    if (tx.occurredAt > cur.latest) cur.latest = tx.occurredAt;
    byProject.set(pid, cur);
  }
  const total = matched.length || 1;
  const items: MatchSuggestion[] = [];
  for (const [pid, info] of byProject) {
    const recency = info.hits / total;
    const confidence = Math.min(0.99, info.sim * 0.7 + recency * 0.3);
    const reason =
      info.sim > 0.4
        ? "Similar description previously matched"
        : info.hits > 1
          ? `Matched ${info.hits} times before`
          : "Recently used project";
    items.push({ projectId: pid, confidence, reason });
  }
  items.sort((a, b) => b.confidence - a.confidence);
  return items.slice(0, 3);
}

export default function MatchingRail({
  focused,
  transactions,
  onApply,
  onIgnore,
  onSplit,
  pending,
}: Props) {
  const suggestions = useMemo(
    () => (focused ? buildSuggestions(focused, transactions) : []),
    [focused, transactions],
  );
  const [manual, setManual] = useState("");

  return (
    <aside
      aria-label="Matching rail"
      className={cn(
        "ring-1 ring-[#e5e5ea] rounded-2xl bg-white",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]",
        "p-5",
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
            Match candidates
          </p>
          <h3 className="text-[15px] font-semibold text-[#1d1d1f] mt-0.5">
            {focused ? "Suggested projects" : "Select a transaction"}
          </h3>
        </div>
        {focused && (
          <span className="font-mono text-[12px] tabular-nums text-[#86868b]">
            {formatDate(focused.occurredAt)}
          </span>
        )}
      </header>

      {focused ? (
        <div className="mt-4 rounded-xl bg-[#fbfbfd] ring-1 ring-[#e5e5ea] p-3.5">
          <p className="truncate text-[13px] font-medium text-[#1d1d1f]">
            {focused.description}
          </p>
          <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-[#1d1d1f]">
            {formatCents(focused.amountCents, { signed: true })}
          </p>
        </div>
      ) : (
        <EmptyState
          variant="compact"
          icon="search"
          title="Pick a row from the table"
          message="Suggestions will appear here"
        />
      )}

      {focused && (
        <>
          <div className="mt-4 space-y-2">
            <AnimatePresence initial={false}>
              {suggestions.length > 0 ? (
                suggestions.map((s, i) => {
                  const pct = Math.round(s.confidence * 100);
                  const tone =
                    s.confidence >= 0.85
                      ? "success"
                      : s.confidence >= 0.5
                        ? "warning"
                        : "neutral";
                  return (
                    <motion.button
                      key={s.projectId}
                      type="button"
                      initial={{ y: 6, opacity: 0 }}
                      animate={{
                        y: 0,
                        opacity: 1,
                        transition: { delay: 0.04 * i, duration: 0.25 },
                      }}
                      exit={{ opacity: 0 }}
                      onClick={() => onApply(focused.id, s.projectId)}
                      disabled={pending}
                      className={cn(
                        "w-full text-left group rounded-xl ring-1 ring-[#e5e5ea] bg-white",
                        "px-3.5 py-3 transition-all duration-200",
                        "hover:-translate-y-0.5 hover:ring-[#0071e3]/40 hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_16px_rgba(0,113,227,0.08)]",
                        "disabled:opacity-60 disabled:hover:translate-y-0",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[#1d1d1f] truncate font-mono">
                            {s.projectId}
                          </p>
                          <p className="mt-0.5 text-[12px] text-[#6e6e73]">
                            {s.reason}
                          </p>
                        </div>
                        <StatusBadge variant={tone === "success" ? "success" : tone === "warning" ? "warning" : "neutral"}>
                          <span className="font-mono tabular-nums">{pct}%</span>
                        </StatusBadge>
                      </div>
                      <div className="mt-2.5 h-1 rounded-full bg-[#f5f5f7] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.05 * i }}
                          className={cn(
                            "h-full",
                            tone === "success" && "bg-[#34c759]",
                            tone === "warning" && "bg-[#ff9500]",
                            tone === "neutral" && "bg-[#a3a3a3]",
                          )}
                        />
                      </div>
                    </motion.button>
                  );
                })
              ) : (
                <div className="rounded-xl ring-1 ring-dashed ring-[#e5e5ea] px-3.5 py-4 text-center">
                  <p className="text-[12px] text-[#86868b]">
                    No history yet — match by typing a project ID below.
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868b] mb-2">
              Match manually
            </p>
            <div className="flex gap-2">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="proj_…"
                className="flex-1 h-9 rounded-[10px] bg-white ring-1 ring-inset ring-black/10 px-3 text-[13px] font-mono placeholder:text-[#86868b] placeholder:font-sans focus:ring-2 focus:ring-[#0071e3] focus:outline-none transition-shadow"
              />
              <Button
                variant="primary"
                size="sm"
                disabled={pending || !manual.trim()}
                onClick={() => {
                  onApply(focused.id, manual.trim());
                  setManual("");
                }}
              >
                Apply
              </Button>
            </div>
          </div>

          <div
            aria-hidden
            className="mt-5 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent"
          />

          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              disabled={pending}
              onClick={() => onSplit(focused.id)}
            >
              Split
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              disabled={pending}
              onClick={() => onIgnore(focused.id)}
            >
              Ignore
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}
