"use client";

import { useEffect, useMemo, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import Button from "@/components/ui/Button";
import { sumSplitAmountsCents } from "@/lib/reconciliation";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { StoredBankTransaction } from "@/app/actions/reconciliation";

export interface SplitRow {
  projectId: string;
  amount: string;
  description: string;
}

interface Props {
  open: boolean;
  transaction: StoredBankTransaction | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (
    transactionId: string,
    splits: { projectId: string; amountCents: number; description: string }[],
  ) => void;
}

const EMPTY_ROW: SplitRow = { projectId: "", amount: "", description: "" };

export default function SplitTransactionModal({
  open,
  transaction,
  pending,
  onClose,
  onSubmit,
}: Props) {
  const [rows, setRows] = useState<SplitRow[]>([{ ...EMPTY_ROW }, { ...EMPTY_ROW }]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows([{ ...EMPTY_ROW }, { ...EMPTY_ROW }]);
    setError(null);
  }, [open, transaction?.id]);

  const totalCents = transaction?.amountCents ?? 0;
  const sumCents = useMemo(() => {
    return sumSplitAmountsCents(
      rows.map((r) => ({
        amountCents: Math.round(Number(r.amount || 0) * 100),
      })),
    );
  }, [rows]);

  const remainingCents = totalCents - sumCents;
  const balanced = Math.abs(remainingCents) < 1;

  function update(i: number, patch: Partial<SplitRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function add() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function remove(i: number) {
    setRows((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function handleSubmit() {
    if (!transaction) return;
    const cleaned = rows
      .map((r) => ({
        projectId: r.projectId.trim(),
        amountCents: Math.round(Number(r.amount || 0) * 100),
        description: r.description.trim() || transaction.description,
      }))
      .filter((r) => r.projectId && r.amountCents !== 0);

    if (cleaned.length < 2) {
      setError("Add at least two splits.");
      return;
    }
    if (!balanced) {
      setError(
        `Splits must sum to the transaction total (${formatCents(remainingCents, { signed: true })} remaining).`,
      );
      return;
    }
    setError(null);
    onSubmit(transaction.id, cleaned);
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Split transaction"
      description={
        transaction ? (
          <span className="font-mono tabular-nums text-[#1d1d1f]">
            {transaction.description} · {formatCents(transaction.amountCents, { signed: true })}
          </span>
        ) : null
      }
      width={520}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px] text-[#6e6e73]">
            <span className="block">
              Sum:{" "}
              <span className="font-mono tabular-nums text-[#1d1d1f]">
                {formatCents(sumCents, { signed: true })}
              </span>
            </span>
            <span
              className={cn(
                "block font-mono tabular-nums",
                balanced ? "text-[#1d8a3a]" : "text-[#c5251c]",
              )}
            >
              {balanced
                ? "Balanced"
                : `${formatCents(remainingCents, { signed: true })} remaining`}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={pending || !balanced}
            >
              {pending ? "Saving…" : "Save splits"}
            </Button>
          </div>
        </div>
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[10px] bg-[#ff3b30]/[0.06] ring-1 ring-[#ff3b30]/30 text-[#c5251c] px-3 py-2 text-[12px]"
        >
          {error}
        </div>
      )}

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div
            key={i}
            className="rounded-xl ring-1 ring-[#e5e5ea] bg-white p-3.5"
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
                Split {i + 1}
              </span>
              {rows.length > 2 && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-[12px] text-[#86868b] hover:text-[#c5251c] transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-12 gap-2.5">
              <input
                value={row.projectId}
                onChange={(e) => update(i, { projectId: e.target.value })}
                placeholder="Project ID"
                className="col-span-7 h-9 rounded-[10px] bg-white ring-1 ring-inset ring-black/10 px-3 text-[13px] font-mono placeholder:font-sans placeholder:text-[#86868b] focus:ring-2 focus:ring-[#0071e3] focus:outline-none transition-shadow"
              />
              <input
                value={row.amount}
                onChange={(e) => update(i, { amount: e.target.value })}
                placeholder="0.00"
                inputMode="decimal"
                className="col-span-5 h-9 rounded-[10px] bg-white ring-1 ring-inset ring-black/10 px-3 text-[13px] font-mono text-right placeholder:font-sans placeholder:text-[#86868b] focus:ring-2 focus:ring-[#0071e3] focus:outline-none transition-shadow"
              />
              <input
                value={row.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="Memo (optional)"
                className="col-span-12 h-9 rounded-[10px] bg-white ring-1 ring-inset ring-black/10 px-3 text-[13px] placeholder:text-[#86868b] focus:ring-2 focus:ring-[#0071e3] focus:outline-none transition-shadow"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={add}
          className="w-full h-10 rounded-[10px] ring-1 ring-dashed ring-[#d2d2d7] text-[13px] font-medium text-[#0071e3] hover:bg-[#0071e3]/[0.04] hover:ring-[#0071e3]/40 transition-all"
        >
          + Add split
        </button>
      </div>
    </Drawer>
  );
}
