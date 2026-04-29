"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import MoneyShell from "@/components/app/money/MoneyShell";
import CockpitHero from "@/components/app/money/CockpitHero";
import CockpitFooter from "@/components/app/money/CockpitFooter";
import EmptyState from "@/components/ui/EmptyState";
import ErrorBanner from "@/components/ui/ErrorBanner";
import Skeleton from "@/components/ui/Skeleton";
import DotPattern from "@/components/ui/DotPattern";
import Drawer from "@/components/ui/Drawer";
import Input from "@/components/ui/Input";
import Label from "@/components/ui/Label";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import BankAccountCard from "@/components/app/bank/BankAccountCard";
import ConnectBankButton from "@/components/app/bank/ConnectBankButton";
import {
  connectBankAccount,
  disconnectBankAccount,
  listBankAccounts,
  syncBankAccount,
  type BankAccountState,
  type StoredBankAccount,
} from "@/app/actions/bank-accounts";
import { formatCents } from "@/lib/format";

const initialState: BankAccountState = { ok: false };

export default function BankPage() {
  const [accounts, setAccounts] = useState<StoredBankAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<"sync" | "disconnect" | null>(null);

  const [state, formAction, pending] = useActionState(connectBankAccount, initialState);
  const [, startRowTransition] = useTransition();
  const stripRef = useRef<HTMLDivElement | null>(null);

  async function loadAccounts() {
    setLoadError(null);
    try {
      const rows = await listBankAccounts();
      setAccounts(rows);
      setLoaded(true);
    } catch {
      setLoadError("Could not load bank accounts");
      setLoaded(true);
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    if (state.ok && state.accounts) {
      setAccounts(state.accounts);
      setDrawerOpen(false);
    }
  }, [state]);

  function handleSync(id: string) {
    setPendingId(id);
    setActionMode("sync");
    startRowTransition(async () => {
      const result = await syncBankAccount(id);
      if (result.ok && result.accounts) setAccounts(result.accounts);
      setPendingId(null);
      setActionMode(null);
    });
  }

  function handleDisconnect() {
    if (!confirmId) return;
    const id = confirmId;
    setPendingId(id);
    setActionMode("disconnect");
    startRowTransition(async () => {
      const result = await disconnectBankAccount(id);
      if (result.ok && result.accounts) setAccounts(result.accounts);
      setConfirmId(null);
      setPendingId(null);
      setActionMode(null);
    });
  }

  const summary = useMemo(() => {
    const totalBalance = accounts.reduce((acc, a) => acc + a.balanceCents, 0);
    const synced = accounts
      .map((a) => a.lastSyncedAt)
      .filter((s): s is string => Boolean(s))
      .sort()
      .reverse();
    const lastSyncedAt = synced[0] ?? null;
    const providers = new Set(accounts.map((a) => a.provider));
    return {
      count: accounts.length,
      totalBalance,
      providersCount: providers.size,
      lastSyncedAt,
    };
  }, [accounts]);

  const featuredId = useMemo(() => {
    const sorted = [...accounts].sort((a, b) => {
      const ta = a.lastSyncedAt ? Date.parse(a.lastSyncedAt) : 0;
      const tb = b.lastSyncedAt ? Date.parse(b.lastSyncedAt) : 0;
      return tb - ta;
    });
    return sorted[0]?.id ?? null;
  }, [accounts]);

  const stats = useMemo(
    () => [
      {
        key: "accounts",
        label: "Accounts",
        value: String(summary.count),
        sub:
          summary.count === 0
            ? "No accounts connected"
            : `${summary.providersCount} provider${summary.providersCount === 1 ? "" : "s"}`,
      },
      {
        key: "balance",
        label: "Total balance",
        value: formatCents(summary.totalBalance, { whole: true }),
        sub: "Across all accounts",
      },
      {
        key: "last-sync",
        label: "Last sync",
        value: summary.lastSyncedAt ? "Today" : "—",
        sub: summary.lastSyncedAt ? "Auto-refreshing" : "Connect to start",
      },
      {
        key: "status",
        label: "Status",
        value: summary.count > 0 ? "Live" : "Idle",
        sub: summary.count > 0 ? "Reconciling cleanly" : "Awaiting connection",
      },
    ],
    [summary],
  );

  const confirmAccount = confirmId ? accounts.find((a) => a.id === confirmId) ?? null : null;

  return (
    <MoneyShell title="Bank" subtitle="Connected accounts and balances">
      <CockpitHero
        eyebrow="Money · Bank Accounts"
        headline="Your money, reconciled."
        subheadline="Connect Teller or Plaid, sync balances, and feed the reconciliation engine — every dollar accounted for."
        stats={stats}
        loading={!loaded}
        trailing={<ConnectBankButton variant="button" onClick={() => setDrawerOpen(true)} />}
      />

      <section className="relative isolate -mx-4 md:-mx-6 lg:-mx-8 px-8 py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/4 -z-10 h-[500px] w-[500px] -translate-y-1/2 rounded-full blur-[120px]"
          style={{ background: "rgba(0,113,227,0.06)" }}
        />
        <DotPattern size={28} className="absolute inset-0 -z-10 opacity-[0.10]" />

        <header className="flex items-end justify-between gap-6 mb-6">
          <div>
            <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-[#171717]">
              Connected accounts
            </h2>
            <p className="mt-1 text-[14px] text-[#525252]">
              Swipe horizontally to browse balances. The most-recently-synced account is highlighted.
            </p>
          </div>
          {loaded && accounts.length > 0 && (
            <StatusBadge variant="info" className="shrink-0">
              {accounts.length} account{accounts.length === 1 ? "" : "s"}
            </StatusBadge>
          )}
        </header>

        {loadError && (
          <div className="mb-6">
            <ErrorBanner message={loadError} onRetry={() => void loadAccounts()} />
          </div>
        )}

        {state.error && !state.ok && !state.fieldErrors && (
          <div className="mb-6">
            <ErrorBanner message={state.error} />
          </div>
        )}

        {!loaded ? (
          <div className="flex gap-5 overflow-x-auto pb-6 px-8 -mx-8" aria-hidden>
            <Skeleton className="h-[220px] min-w-[340px] w-[340px] rounded-2xl" />
            <Skeleton className="h-[220px] min-w-[340px] w-[340px] rounded-2xl" />
            <Skeleton className="h-[220px] min-w-[340px] w-[340px] rounded-2xl" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)] py-4">
            <EmptyState
              title="No bank accounts connected"
              description="Plug in your first account to start reconciling transactions across projects."
              action={
                <ConnectBankButton variant="button" onClick={() => setDrawerOpen(true)} />
              }
            />
          </div>
        ) : (
          <div
            ref={stripRef}
            className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-6 px-8 -mx-8"
            aria-label="Connected bank accounts"
          >
            {accounts.map((acct) => {
              const isSyncing = pendingId === acct.id && actionMode === "sync";
              const isDisconnecting = pendingId === acct.id && actionMode === "disconnect";
              return (
                <BankAccountCard
                  key={acct.id}
                  account={acct}
                  featured={acct.id === featuredId}
                  syncing={isSyncing}
                  disconnecting={isDisconnecting}
                  onSync={handleSync}
                  onDisconnect={(id) => setConfirmId(id)}
                />
              );
            })}
            <ConnectBankButton onClick={() => setDrawerOpen(true)} />
          </div>
        )}

        <div
          aria-hidden
          className="h-px bg-gradient-to-r from-transparent via-black/10 to-transparent my-12"
        />

        <CockpitFooter lastSyncedAt={summary.lastSyncedAt} />
      </section>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Connect a bank account"
        description="Sandbox-style connect — Teller and Plaid OAuth flows wire up to the same form."
      >
        <form action={formAction} className="space-y-5" aria-label="Connect bank account">
          {state.error && !state.ok && (
            <ErrorBanner message={state.error} />
          )}
          {state.ok && state.account && (
            <div
              role="status"
              className="rounded-[10px] bg-[#34c759]/[0.08] ring-1 ring-[#34c759]/30 px-3 py-2 text-[13px] text-[#1d8a3a]"
            >
              Connected {state.account.bankName} •••• {state.account.accountMask}
            </div>
          )}

          <div>
            <Label htmlFor="bk-name">Bank name</Label>
            <Input
              id="bk-name"
              name="bankName"
              required
              placeholder="Chase, BoA, Mercury…"
              invalid={Boolean(state.fieldErrors?.bankName)}
              autoComplete="off"
            />
            {state.fieldErrors?.bankName && (
              <p className="mt-1 text-[12px] text-[#c5251c]">{state.fieldErrors.bankName}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bk-mask">Last 4 digits</Label>
              <Input
                id="bk-mask"
                name="accountMask"
                inputMode="numeric"
                required
                pattern="\d{4}"
                placeholder="1234"
                maxLength={4}
                invalid={Boolean(state.fieldErrors?.accountMask)}
                autoComplete="off"
              />
              {state.fieldErrors?.accountMask && (
                <p className="mt-1 text-[12px] text-[#c5251c]">
                  {state.fieldErrors.accountMask}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="bk-balance" optional>
                Opening balance (USD)
              </Label>
              <Input
                id="bk-balance"
                name="balance"
                inputMode="decimal"
                placeholder="0.00"
                invalid={Boolean(state.fieldErrors?.balance)}
                autoComplete="off"
              />
              {state.fieldErrors?.balance && (
                <p className="mt-1 text-[12px] text-[#c5251c]">{state.fieldErrors.balance}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="bk-provider">Provider</Label>
            <select
              id="bk-provider"
              name="provider"
              defaultValue="teller"
              className="w-full bg-white text-[#1d1d1f] ring-1 ring-inset ring-[#e5e5ea] rounded-[10px] h-10 px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#0071e3] transition-shadow"
            >
              <option value="teller">Teller</option>
              <option value="plaid">Plaid</option>
            </select>
            {state.fieldErrors?.provider && (
              <p className="mt-1 text-[12px] text-[#c5251c]">{state.fieldErrors.provider}</p>
            )}
          </div>

          <input type="hidden" name="currency" value="USD" />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setDrawerOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? "Connecting…" : "Connect account"}
            </Button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={confirmId !== null}
        onClose={() => (pendingId ? null : setConfirmId(null))}
        onConfirm={handleDisconnect}
        title="Disconnect account?"
        description={
          confirmAccount
            ? `${confirmAccount.bankName} •••• ${confirmAccount.accountMask} will stop syncing. Existing transactions remain in reconciliation history.`
            : "This account will stop syncing."
        }
        confirmLabel="Disconnect"
        cancelLabel="Keep connected"
        tone="danger"
        pending={Boolean(pendingId) && actionMode === "disconnect"}
      />
    </MoneyShell>
  );
}
