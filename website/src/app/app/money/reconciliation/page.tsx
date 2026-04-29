"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import MoneyShell from "@/components/app/money/MoneyShell";
import CockpitHero from "@/components/app/money/CockpitHero";
import CockpitFooter from "@/components/app/money/CockpitFooter";
import DotPattern from "@/components/ui/DotPattern";
import DataTable from "@/components/ui/DataTable";
import FilterBar from "@/components/ui/FilterBar";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import ErrorBanner from "@/components/ui/ErrorBanner";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import StatusBadge from "@/components/ui/StatusBadge";
import ReconciliationToolbar from "@/components/app/money/ReconciliationToolbar";
import MatchingRail from "@/components/app/money/MatchingRail";
import SplitTransactionModal from "@/components/app/money/SplitTransactionModal";
import { transactionColumns } from "@/components/app/money/TransactionRow";
import { listBankAccounts, type StoredBankAccount } from "@/app/actions/bank-accounts";
import {
  bulkIgnoreTransactions,
  bulkMatchTransactions,
  ignoreTransaction,
  listTransactions,
  matchTransaction,
  recordTransaction,
  splitTransaction,
  unmatchTransaction,
  type ReconciliationState,
  type StoredBankTransaction,
} from "@/app/actions/reconciliation";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { BankTransactionMatchStatus } from "@/types";

const initialState: ReconciliationState = { ok: false };

type StatusFilter = "all" | BankTransactionMatchStatus;

export default function ReconciliationPage() {
  const [accounts, setAccounts] = useState<StoredBankAccount[]>([]);
  const [transactions, setTransactions] = useState<StoredBankTransaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState(recordTransaction, initialState);
  const [rowPending, startRowTransition] = useTransition();

  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [splitForId, setSplitForId] = useState<string | null>(null);

  function reload(): void {
    setLoadError(null);
    void Promise.all([listBankAccounts(), listTransactions()])
      .then(([a, t]) => {
        setAccounts(a);
        setTransactions(t);
        setLoaded(true);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : "Failed to load data");
        setLoaded(true);
      });
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (state.ok && state.transactions) setTransactions(state.transactions);
  }, [state]);

  const summary = useMemo(() => {
    const unmatched = transactions.filter((t) => t.matchStatus === "unmatched");
    const matched = transactions.filter((t) => t.matchStatus === "matched");
    const ignored = transactions.filter((t) => t.matchStatus === "ignored");
    const totalIn = transactions
      .filter((t) => t.amountCents > 0)
      .reduce((a, t) => a + t.amountCents, 0);
    const totalOut = transactions
      .filter((t) => t.amountCents < 0)
      .reduce((a, t) => a + t.amountCents, 0);
    const unmatchedTotal = unmatched.reduce((a, t) => a + t.amountCents, 0);
    return {
      unmatchedCount: unmatched.length,
      matchedCount: matched.length,
      ignoredCount: ignored.length,
      unmatchedTotal,
      totalIn,
      totalOut,
    };
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return transactions.filter((t) => {
      if (accountFilter !== "all" && t.accountId !== accountFilter) return false;
      if (statusFilter !== "all" && t.matchStatus !== statusFilter) return false;
      if (q && !t.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [transactions, accountFilter, statusFilter, search]);

  const selectedTransactions = useMemo(
    () => filtered.filter((t) => selectedIds.has(t.id)),
    [filtered, selectedIds],
  );
  const selectedTotalCents = useMemo(
    () => selectedTransactions.reduce((a, t) => a + t.amountCents, 0),
    [selectedTransactions],
  );

  const focused = useMemo(
    () => transactions.find((t) => t.id === focusedId) ?? null,
    [focusedId, transactions],
  );
  const splitTransaction_ = useMemo(
    () => transactions.find((t) => t.id === splitForId) ?? null,
    [splitForId, transactions],
  );

  function toggleSelected(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length && filtered.length > 0) return new Set();
      return new Set(filtered.map((t) => t.id));
    });
  }

  function clearSelection(): void {
    setSelectedIds(new Set());
  }

  function applyResult(result: ReconciliationState): void {
    if (result.ok && result.transactions) {
      setTransactions(result.transactions);
    }
  }

  function onMatch(id: string, projectId: string): void {
    if (!projectId.trim()) return;
    startRowTransition(async () => {
      applyResult(await matchTransaction(id, projectId));
    });
  }

  function onIgnore(id: string): void {
    startRowTransition(async () => {
      applyResult(await ignoreTransaction(id));
    });
  }

  function onUnmatch(id: string): void {
    startRowTransition(async () => {
      applyResult(await unmatchTransaction(id));
    });
  }

  function onAssignFocus(id: string): void {
    setFocusedId(id);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function onSplit(id: string): void {
    setSplitForId(id);
  }

  function onBulkMatch(projectId: string): void {
    const ids = Array.from(selectedIds);
    if (!projectId.trim() || ids.length === 0) return;
    startRowTransition(async () => {
      const result = await bulkMatchTransactions(ids, projectId);
      applyResult(result);
      if (result.ok) clearSelection();
    });
  }

  function onBulkIgnore(): void {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    startRowTransition(async () => {
      const result = await bulkIgnoreTransactions(ids);
      applyResult(result);
      if (result.ok) clearSelection();
    });
  }

  function onSubmitSplit(
    transactionId: string,
    splits: { projectId: string; amountCents: number; description: string }[],
  ): void {
    startRowTransition(async () => {
      const result = await splitTransaction(transactionId, splits);
      applyResult(result);
      if (result.ok) setSplitForId(null);
    });
  }

  const accountChips = useMemo(
    () => [
      { key: "all", label: "All accounts", count: transactions.length },
      ...accounts.map((a) => ({
        key: a.id,
        label: `${a.bankName} ··${a.accountMask}`,
        count: transactions.filter((t) => t.accountId === a.id).length,
      })),
    ],
    [accounts, transactions],
  );

  const statusChips: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: transactions.length },
    { key: "unmatched", label: "Unmatched", count: summary.unmatchedCount },
    { key: "matched", label: "Matched", count: summary.matchedCount },
    { key: "ignored", label: "Ignored", count: summary.ignoredCount },
  ];

  const headerCheckbox = (() => {
    if (filtered.length === 0) return false as const;
    if (selectedIds.size === 0) return false as const;
    if (selectedTransactions.length === filtered.length) return true as const;
    return "indeterminate" as const;
  })();

  const columns = useMemo(
    () =>
      transactionColumns({
        selectedIds,
        toggleSelected,
        focusedId,
        setFocusedId,
        accounts,
        actions: {
          match: () => undefined,
          ignore: onIgnore,
          unmatch: onUnmatch,
          edit: () => undefined,
          split: onSplit,
          assign: onAssignFocus,
        },
        pending: rowPending,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, focusedId, accounts, rowPending],
  );

  const columnsWithHeader = useMemo(() => {
    return columns.map((col) =>
      col.key === "select"
        ? {
            ...col,
            header: "" as const,
            thClassName: "px-4",
            render: col.render,
          }
        : col,
    );
  }, [columns]);

  // Custom header row checkbox is rendered above the table since DataTable
  // doesn't expose header cell renderers. Display in toolbar context.

  return (
    <MoneyShell title="Reconciliation" subtitle="Match bank activity to projects">
      <CockpitHero
        eyebrow="Money · Reconciliation"
        headline="Reconcile every dollar."
        subheadline="Pair bank activity with projects, ignore noise, and split shared expenses — all from one keyboard-friendly cockpit."
        loading={!loaded}
        stats={[
          {
            key: "unmatched",
            label: "Unmatched",
            value: summary.unmatchedCount,
            sub: <span className="font-mono tabular-nums">{formatCents(summary.unmatchedTotal, { signed: true })} pending</span>,
          },
          {
            key: "matched",
            label: "Matched",
            value: summary.matchedCount,
            sub: "Cleared this period",
          },
          {
            key: "in",
            label: "Cash in",
            value: formatCents(summary.totalIn),
            delta: { value: "+", tone: "positive" },
          },
          {
            key: "out",
            label: "Cash out",
            value: formatCents(summary.totalOut),
            delta: { value: "−", tone: "negative" },
          },
        ]}
      />

      <section
        aria-label="Reconciliation workspace"
        className="relative grid grid-cols-12 gap-6 px-2 md:px-4 lg:px-8 py-8"
      >
        {/* Atmosphere — gradient blob */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 -z-10 h-[600px] w-[600px] rounded-full blur-[130px]"
          style={{ background: "rgba(0,113,227,0.05)" }}
        />
        {/* Atmosphere — DotPattern */}
        <DotPattern
          size={24}
          className="absolute inset-0 -z-10 opacity-[0.08]"
        />

        {/* Table column */}
        <div className="col-span-12 lg:col-span-8 min-w-0">
          {loadError && (
            <ErrorBanner
              className="mb-4"
              message={loadError}
              onRetry={() => reload()}
            />
          )}

          <div className="mb-5 flex flex-col gap-3">
            <FilterBar
              chips={statusChips.map((c) => ({ ...c, key: c.key }))}
              active={statusFilter}
              onChange={(k) => {
                setStatusFilter(k as StatusFilter);
                clearSelection();
              }}
              search={search}
              onSearch={setSearch}
              searchPlaceholder="Search descriptions…"
            />

            {accounts.length > 1 && (
              <FilterBar
                chips={accountChips}
                active={accountFilter}
                onChange={(k) => {
                  setAccountFilter(k);
                  clearSelection();
                }}
              />
            )}
          </div>

          <ReconciliationToolbar
            selectedCount={selectedIds.size}
            totalCents={selectedTotalCents}
            pending={rowPending}
            onBulkMatch={onBulkMatch}
            onBulkIgnore={onBulkIgnore}
            onClear={clearSelection}
          />

          {/* Header bar with select-all + meta */}
          <div className="flex items-center gap-3 px-1 pb-3">
            <Checkbox
              checked={headerCheckbox === true}
              indeterminate={headerCheckbox === "indeterminate"}
              onCheckedChange={toggleAll}
              aria-label="Select all transactions"
              disabled={filtered.length === 0}
            />
            <span className="text-[12px] text-[#86868b]">
              {filtered.length === transactions.length
                ? `${filtered.length} transactions`
                : `${filtered.length} of ${transactions.length} shown`}
            </span>
            {selectedIds.size > 0 && (
              <span className="text-[12px] text-[#0071e3] font-medium">
                · {selectedIds.size} selected
              </span>
            )}
            <span className="ml-auto text-[12px] text-[#86868b] hidden md:inline">
              Click a row to focus it in the rail →
            </span>
          </div>

          {!loaded ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div
              className={cn(
                "rounded-2xl bg-white ring-1 ring-[#e5e5ea]",
                "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]",
              )}
            >
              <EmptyState
                icon="money"
                title={
                  transactions.length === 0
                    ? "No transactions to reconcile"
                    : "No transactions match these filters"
                }
                description={
                  transactions.length === 0
                    ? "Record one with the form below to start reconciling."
                    : "Adjust the filters above or clear the search."
                }
              />
            </div>
          ) : (
            <DataTable
              columns={columnsWithHeader}
              data={filtered}
              rowKey={(r) => r.id}
              density="compact"
              stickyHeader
              onRowClick={(r) => setFocusedId(r.id)}
              className={cn(focusedId && "ring-[#0071e3]/20")}
            />
          )}

          {/* Add transaction form */}
          <RecordTransactionForm
            accounts={accounts}
            state={state}
            formAction={formAction}
            pending={pending}
          />
        </div>

        {/* Sticky rail column */}
        <div className="col-span-12 lg:col-span-4">
          <div className="sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 space-y-4">
            <MatchingRail
              focused={focused}
              transactions={transactions}
              onApply={onMatch}
              onIgnore={onIgnore}
              onSplit={onSplit}
              pending={rowPending}
            />

            <div
              aria-hidden
              className="h-px bg-gradient-to-r from-transparent via-black/10 to-transparent"
            />

            <RailMeta summary={summary} />
          </div>
        </div>
      </section>

      <SplitTransactionModal
        open={splitForId !== null}
        transaction={splitTransaction_}
        pending={rowPending}
        onClose={() => setSplitForId(null)}
        onSubmit={onSubmitSplit}
      />

      <CockpitFooter
        lastSyncedAt={
          accounts
            .map((a) => a.lastSyncedAt)
            .filter((s): s is string => Boolean(s))
            .sort()
            .pop() ?? null
        }
        meta={
          <span>
            {summary.unmatchedCount} unmatched · {summary.matchedCount} matched
          </span>
        }
      />
    </MoneyShell>
  );
}

function RailMeta({
  summary,
}: {
  summary: {
    unmatchedCount: number;
    matchedCount: number;
    ignoredCount: number;
    unmatchedTotal: number;
  };
}) {
  const total = summary.unmatchedCount + summary.matchedCount + summary.ignoredCount;
  const matchedPct = total === 0 ? 0 : Math.round((summary.matchedCount / total) * 100);
  return (
    <aside
      className={cn(
        "ring-1 ring-[#e5e5ea] rounded-2xl bg-white p-5",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
        This period
      </p>
      <p className="mt-1 font-mono text-[28px] font-semibold tabular-nums leading-none text-[#1d1d1f]">
        {matchedPct}%
      </p>
      <p className="mt-1 text-[12px] text-[#6e6e73]">reconciled</p>
      <div className="mt-3 h-1.5 rounded-full bg-[#f5f5f7] overflow-hidden">
        <div
          className="h-full bg-[#0071e3] transition-all duration-700"
          style={{ width: `${matchedPct}%` }}
        />
      </div>
      <dl className="mt-4 space-y-2 text-[12px]">
        <Row label="Unmatched" value={summary.unmatchedCount.toString()} tone="warning" />
        <Row label="Matched" value={summary.matchedCount.toString()} tone="success" />
        <Row label="Ignored" value={summary.ignoredCount.toString()} tone="muted" />
      </dl>
    </aside>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "muted";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-2 text-[#525252]">
        <span
          aria-hidden
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "success" && "bg-[#34c759]",
            tone === "warning" && "bg-[#ff9500]",
            tone === "muted" && "bg-[#a3a3a3]",
          )}
        />
        {label}
      </span>
      <span className="font-mono tabular-nums text-[#1d1d1f]">{value}</span>
    </div>
  );
}

function RecordTransactionForm({
  accounts,
  state,
  formAction,
  pending,
}: {
  accounts: StoredBankAccount[];
  state: ReconciliationState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form
      action={formAction}
      aria-label="Record bank transaction"
      className={cn(
        "mt-8 rounded-2xl bg-white ring-1 ring-[#e5e5ea] p-6",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]",
      )}
    >
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
            Add transaction
          </p>
          <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1d1d1f] mt-0.5">
            Record manual entry
          </h3>
        </div>
        <StatusBadge variant="neutral">
          <span className="font-mono normal-case">manual</span>
        </StatusBadge>
      </header>

      {state.error && !state.ok && (
        <div
          role="alert"
          className="mt-4 rounded-[10px] bg-[#ff3b30]/[0.06] ring-1 ring-[#ff3b30]/30 text-[#c5251c] px-3 py-2 text-[12px]"
        >
          {state.error}
        </div>
      )}
      {state.ok && state.transaction && (
        <div
          role="status"
          className="mt-4 rounded-[10px] bg-[#34c759]/[0.08] ring-1 ring-[#34c759]/30 text-[#1d8a3a] px-3 py-2 text-[12px]"
        >
          Saved <span className="font-medium">{state.transaction.description}</span>
        </div>
      )}

      <div className="mt-5 grid grid-cols-12 gap-3">
        <Field
          className="col-span-12 md:col-span-4"
          id="rc-account"
          label="Account"
          error={state.fieldErrors?.accountId}
        >
          <select
            id="rc-account"
            name="accountId"
            required
            disabled={accounts.length === 0}
            className={inputClasses}
          >
            {accounts.length === 0 ? (
              <option value="">Connect an account first</option>
            ) : (
              accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bankName} ··{a.accountMask}
                </option>
              ))
            )}
          </select>
        </Field>
        <Field
          className="col-span-12 md:col-span-5"
          id="rc-desc"
          label="Description"
          error={state.fieldErrors?.description}
        >
          <input
            id="rc-desc"
            name="description"
            required
            placeholder="Home Depot — supplies"
            className={inputClasses}
          />
        </Field>
        <Field
          className="col-span-6 md:col-span-3"
          id="rc-date"
          label="Date"
          error={state.fieldErrors?.occurredAt}
        >
          <input
            id="rc-date"
            name="occurredAt"
            type="date"
            required
            defaultValue={today}
            className={inputClasses}
          />
        </Field>
        <Field
          className="col-span-6 md:col-span-3"
          id="rc-amount"
          label="Amount"
          hint="Negative = debit"
          error={state.fieldErrors?.amount}
        >
          <input
            id="rc-amount"
            name="amount"
            required
            inputMode="decimal"
            placeholder="-123.45"
            className={cn(inputClasses, "font-mono")}
          />
        </Field>
        <Field
          className="col-span-6 md:col-span-4"
          id="rc-status"
          label="Status"
          error={state.fieldErrors?.matchStatus}
        >
          <select
            id="rc-status"
            name="matchStatus"
            defaultValue="unmatched"
            className={inputClasses}
          >
            <option value="unmatched">Unmatched</option>
            <option value="matched">Matched</option>
            <option value="ignored">Ignored</option>
          </select>
        </Field>
        <Field
          className="col-span-12 md:col-span-5"
          id="rc-project"
          label="Project ID"
          hint="Required when matched"
          error={state.fieldErrors?.projectId}
        >
          <input
            id="rc-project"
            name="projectId"
            placeholder="proj_…"
            className={cn(inputClasses, "font-mono")}
          />
        </Field>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        <p className="text-[12px] text-[#86868b]">
          Saved entries land in the table and the matching rail.
        </p>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={pending || accounts.length === 0}
        >
          {pending ? "Saving…" : "Add transaction"}
        </Button>
      </div>
    </form>
  );
}

const inputClasses =
  "w-full h-9 rounded-[10px] bg-white ring-1 ring-inset ring-black/10 px-3 text-[13px] placeholder:text-[#86868b] focus:ring-2 focus:ring-[#0071e3] focus:outline-none transition-shadow";

function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868b] mb-1.5"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-[11px] text-[#c5251c]">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-[#a3a3a3]">{hint}</p>
      ) : null}
    </div>
  );
}
