"use client";

import type { Column } from "@/components/ui/DataTable";
import Checkbox from "@/components/ui/Checkbox";
import StatusBadge from "@/components/ui/StatusBadge";
import RowActions from "@/components/ui/RowActions";
import AmountPill from "./AmountPill";
import MatchPill from "./MatchPill";
import { formatDate } from "@/lib/format";
import type { StoredBankTransaction } from "@/app/actions/reconciliation";
import type { StoredBankAccount } from "@/app/actions/bank-accounts";
import { cn } from "@/lib/cn";

export interface TransactionRowAction {
  match: (id: string) => void;
  ignore: (id: string) => void;
  unmatch: (id: string) => void;
  edit: (id: string) => void;
  split: (id: string) => void;
  assign: (id: string) => void;
}

export interface TransactionRowContext {
  selectedIds: Set<string>;
  toggleSelected: (id: string) => void;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  accounts: StoredBankAccount[];
  actions: TransactionRowAction;
  pending: boolean;
}

export function transactionColumns(ctx: TransactionRowContext): Column<StoredBankTransaction>[] {
  const accountsById = new Map(ctx.accounts.map((a) => [a.id, a] as const));

  return [
    {
      key: "select",
      header: "",
      width: "40px",
      render: (row) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={ctx.selectedIds.has(row.id)}
            onCheckedChange={() => ctx.toggleSelected(row.id)}
            aria-label={`Select transaction ${row.description}`}
          />
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      width: "108px",
      render: (row) => (
        <span className="font-mono text-[13px] text-[#1d1d1f] tabular-nums">
          {formatDate(row.occurredAt)}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (row) => {
        const isFocused = ctx.focusedId === row.id;
        return (
          <div className="flex min-w-0 flex-col">
            <span
              className={cn(
                "truncate text-[13px]",
                isFocused ? "font-semibold text-[#0071e3]" : "font-medium text-[#1d1d1f]",
              )}
            >
              {row.description}
            </span>
            {row.note && (
              <span className="truncate text-[11px] text-[#86868b]">{row.note}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      width: "120px",
      render: (row) => <AmountPill amountCents={row.amountCents} />,
    },
    {
      key: "account",
      header: "Account",
      width: "140px",
      render: (row) => {
        const acct = accountsById.get(row.accountId);
        return (
          <StatusBadge variant="neutral">
            <span className="normal-case">
              {acct ? `${acct.bankName} ··${acct.accountMask}` : "Unknown"}
            </span>
          </StatusBadge>
        );
      },
    },
    {
      key: "match",
      header: "Match",
      width: "138px",
      render: (row) => (
        <MatchPill
          status={row.matchStatus}
          confidence={row.matchStatus === "matched" ? 1 : null}
          showConfidence={false}
        />
      ),
    },
    {
      key: "project",
      header: "Project",
      width: "156px",
      render: (row) =>
        row.matchedProjectId ? (
          <StatusBadge variant="info" className="font-mono">
            <span className="truncate normal-case">{row.matchedProjectId}</span>
          </StatusBadge>
        ) : (
          <StatusBadge variant="neutral">Unassigned</StatusBadge>
        ),
    },
    {
      key: "actions",
      header: "",
      width: "48px",
      align: "right",
      render: (row) => (
        <span onClick={(e) => e.stopPropagation()}>
          <RowActions
            items={[
              {
                label: "Match to project",
                onClick: () => ctx.actions.assign(row.id),
                disabled: ctx.pending,
              },
              {
                label: "Split across projects",
                onClick: () => ctx.actions.split(row.id),
                disabled: ctx.pending,
              },
              { separator: true },
              {
                label: row.matchStatus === "ignored" ? "Restore" : "Ignore",
                onClick: () =>
                  row.matchStatus === "ignored"
                    ? ctx.actions.unmatch(row.id)
                    : ctx.actions.ignore(row.id),
                disabled: ctx.pending,
              },
              {
                label: "Reset status",
                onClick: () => ctx.actions.unmatch(row.id),
                disabled: ctx.pending || row.matchStatus === "unmatched",
              },
            ]}
          />
        </span>
      ),
    },
  ];
}
