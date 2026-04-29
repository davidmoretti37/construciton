"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate } from "@/lib/format";
import StatusBadge from "@/components/ui/StatusBadge";
import BorderBeam from "@/components/ui/BorderBeam";
import type { DbInvoice } from "@/types/database";

type Variant = "featured" | "compact";

interface Props {
  invoice: DbInvoice | null;
  variant?: Variant;
  selected?: boolean;
  href?: string;
  className?: string;
}

export default function DocumentPreviewCard({
  invoice,
  variant = "compact",
  selected,
  href,
  className = "",
}: Props) {
  if (!invoice) return null;

  const overdue = invoice.status === "overdue";
  const paidPct =
    invoice.total > 0
      ? Math.min(100, Math.max(0, (Number(invoice.amount_paid ?? 0) / invoice.total) * 100))
      : 0;

  const body =
    variant === "featured" ? (
      <FeaturedBody invoice={invoice} paidPct={paidPct} />
    ) : (
      <CompactBody invoice={invoice} />
    );

  const wrapperCls = cn(
    "relative block bg-white ring-1 ring-[#e5e5ea] transition-all duration-200",
    variant === "featured"
      ? "rounded-2xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_16px_rgba(0,0,0,0.04),0_24px_48px_rgba(0,0,0,0.06)]"
      : "rounded-xl p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
    selected && "ring-[#0071e3] shadow-[0_0_0_3px_rgba(0,113,227,0.10),0_8px_16px_rgba(0,113,227,0.10)]",
    !selected && variant === "compact" && "hover:ring-[#d2d2d7] hover:-translate-y-0.5",
    className,
  );

  const inner = (
    <>
      {body}
      {overdue && variant === "featured" && (
        <BorderBeam
          duration={6}
          colorFrom="#ff3b30"
          colorTo="#ff9500"
          borderRadius={16}
        />
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={wrapperCls}>
        {inner}
      </Link>
    );
  }
  return <div className={wrapperCls}>{inner}</div>;
}

function FeaturedBody({ invoice, paidPct }: { invoice: DbInvoice; paidPct: number }) {
  return (
    <div className="relative z-10 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#86868b]">
            Invoice
          </p>
          <p className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-[#1d1d1f]">
            {invoice.invoice_number ?? `#${invoice.id.slice(0, 6)}`}
          </p>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#f0f0f3]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#86868b]">
            Amount
          </p>
          <p className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-[#1d1d1f]">
            {formatCurrency(invoice.total, { whole: true })}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#86868b]">
            Paid
          </p>
          <p className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-[#1d1d1f]">
            {formatCurrency(invoice.amount_paid, { whole: true })}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-[#86868b]">Collection</span>
          <span className="font-mono text-[11px] tabular-nums text-[#6e6e73]">
            {paidPct.toFixed(0)}%
          </span>
        </div>
        <div className="h-1 bg-[#f5f5f7] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#0071e3] rounded-full transition-[width] duration-500"
            style={{ width: `${paidPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <span className="text-[#86868b]">Issued</span>
          <p className="font-mono tabular-nums text-[#1d1d1f]">
            {invoice.issued_at ? formatDate(invoice.issued_at) : "—"}
          </p>
        </div>
        <div>
          <span className="text-[#86868b]">Due</span>
          <p className="font-mono tabular-nums text-[#1d1d1f]">
            {invoice.due_date ? formatDate(invoice.due_date) : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompactBody({ invoice }: { invoice: DbInvoice }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[13px] tabular-nums text-[#1d1d1f] truncate">
          {invoice.invoice_number ?? `#${invoice.id.slice(0, 6)}`}
        </p>
        <p className="text-[11px] text-[#86868b] truncate">
          {invoice.due_date ? `Due ${formatDate(invoice.due_date)}` : "No due date"}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-[13px] tabular-nums text-[#1d1d1f]">
          {formatCurrency(invoice.total, { whole: true })}
        </span>
        <StatusBadge status={invoice.status} />
      </div>
    </div>
  );
}
