"use client";

import { cn } from "@/lib/cn";
import { formatCents, formatRelativeDays } from "@/lib/format";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import BorderBeam from "@/components/ui/BorderBeam";
import type { StoredBankAccount } from "@/app/actions/bank-accounts";

interface Props {
  account: StoredBankAccount;
  featured?: boolean;
  syncing?: boolean;
  disconnecting?: boolean;
  onSync: (id: string) => void;
  onDisconnect: (id: string) => void;
}

export default function BankAccountCard({
  account,
  featured = false,
  syncing = false,
  disconnecting = false,
  onSync,
  onDisconnect,
}: Props) {
  const synced = account.lastSyncedAt
    ? formatRelativeDays(account.lastSyncedAt)
    : null;

  return (
    <article
      className={cn(
        "group relative snap-start shrink-0 min-w-[340px] w-[340px]",
        "bg-white rounded-2xl ring-1 ring-[#e5e5ea] p-6",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]",
        "hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]",
        "hover:-translate-y-0.5 transition-all duration-300",
        featured && "shadow-[0_2px_4px_rgba(0,113,227,0.08),0_8px_24px_rgba(0,113,227,0.10)]"
      )}
    >
      {featured && <BorderBeam duration={8} colorFrom="#0071e3" colorTo="#34c759" />}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-[#34c759]" aria-hidden />
            <h3 className="text-[15px] font-medium text-[#171717] truncate">
              {account.bankName}
            </h3>
          </div>
          <p className="mt-1 font-mono text-[13px] tabular-nums text-[#a3a3a3]">
            •••• {account.accountMask}
          </p>
        </div>
        <StatusBadge variant="neutral" className="capitalize">
          {account.provider}
        </StatusBadge>
      </div>

      <p className="relative mt-5 font-mono text-[28px] font-semibold tracking-tight tabular-nums text-[#171717]">
        {formatCents(account.balanceCents)}{" "}
        <span className="text-[12px] font-medium text-[#a3a3a3]">{account.currency}</span>
      </p>

      <p className="relative mt-2 text-[12px] text-[#a3a3a3]">
        {synced ? (
          <>
            Synced{" "}
            <span className="font-mono tabular-nums text-[#525252]">{synced}</span>
          </>
        ) : (
          "Not synced yet"
        )}
      </p>

      <div className="relative mt-5 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSync(account.id)}
          disabled={syncing || disconnecting}
        >
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDisconnect(account.id)}
          disabled={syncing || disconnecting}
        >
          Disconnect
        </Button>
      </div>
    </article>
  );
}
