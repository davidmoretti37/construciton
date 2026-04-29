"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MoneyShell from "@/components/app/money/MoneyShell";
import StatCard from "@/components/app/dashboard/StatCard";
import DotPattern from "@/components/ui/DotPattern";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import MoneyCell from "@/components/ui/MoneyCell";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import ErrorBanner from "@/components/ui/ErrorBanner";
import Button from "@/components/ui/Button";
import RowActions from "@/components/ui/RowActions";
import Drawer from "@/components/ui/Drawer";
import DocumentPreviewRail from "@/components/app/money/DocumentPreviewRail";
import InvoiceForm from "@/components/app/money/InvoiceForm";
import SendDocumentModal from "@/components/app/money/SendDocumentModal";
import { useInvoices } from "@/hooks/useInvoices";
import { deleteInvoice } from "@/app/actions/invoices";
import { useToast } from "@/components/ui/toast-provider";
import { formatCurrency, formatDate, formatRelativeDays } from "@/lib/format";
import type { DbInvoice } from "@/types/database";
import type { DensityMode } from "@/types";

const FILTER_CHIPS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
];

export default function InvoicesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { invoices, loading, error, refetch } = useInvoices();

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [sendInvoice, setSendInvoice] = useState<DbInvoice | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (filter === "overdue") {
        if (
          !(inv.due_date && inv.due_date < today && inv.status !== "paid" && inv.status !== "void")
        ) {
          return false;
        }
      } else if (filter !== "all" && inv.status !== filter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const num = (inv.invoice_number ?? "").toLowerCase();
        const client = (inv.client_id ?? "").toLowerCase();
        if (!num.includes(q) && !client.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, filter, search, today]);

  const kpis = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    let overdueCount = 0;
    let paidThisMonth = 0;
    const month = today.slice(0, 7);
    let daysSum = 0;
    let daysCount = 0;
    let outstandingCount = 0;

    for (const inv of invoices) {
      const total = Number(inv.total ?? 0);
      const paid = Number(inv.amount_paid ?? 0);
      const remaining = Math.max(total - paid, 0);
      if (remaining > 0 && inv.status !== "void") {
        outstanding += remaining;
        outstandingCount += 1;
      }
      if (
        inv.due_date &&
        inv.due_date < today &&
        inv.status !== "paid" &&
        inv.status !== "void"
      ) {
        overdue += remaining;
        overdueCount += 1;
      }
      if (inv.paid_at && inv.paid_at.slice(0, 7) === month) {
        paidThisMonth += paid;
      }
      if (inv.paid_at && inv.issued_at) {
        const d1 = new Date(inv.issued_at).getTime();
        const d2 = new Date(inv.paid_at).getTime();
        if (Number.isFinite(d1) && Number.isFinite(d2) && d2 >= d1) {
          daysSum += (d2 - d1) / 86_400_000;
          daysCount += 1;
        }
      }
    }
    return {
      outstanding,
      outstandingCount,
      overdue,
      overdueCount,
      paidThisMonth,
      avgDays: daysCount > 0 ? Math.round(daysSum / daysCount) : 0,
    };
  }, [invoices, today]);

  const featured = selectedId
    ? invoices.find((i) => i.id === selectedId) ?? null
    : null;

  const columns: Column<DbInvoice>[] = [
    {
      key: "invoice_number",
      header: "Number",
      width: "120px",
      render: (r) => (
        <span className="font-mono tabular-nums text-[13px] text-[#1d1d1f]">
          {r.invoice_number ?? `#${r.id.slice(0, 6)}`}
        </span>
      ),
    },
    {
      key: "client_id",
      header: "Client",
      render: (r) => (
        <span className="text-[13px] text-[#1d1d1f]">
          {r.client_id ? (
            <span className="font-mono text-[12px] text-[#6e6e73]">
              {r.client_id.slice(0, 8)}…
            </span>
          ) : (
            <span className="text-[#a3a3a3]">—</span>
          )}
        </span>
      ),
    },
    {
      key: "issued_at",
      header: "Issued",
      render: (r) => (
        <span className="font-mono tabular-nums text-[12px] text-[#6e6e73]">
          {r.issued_at ? formatDate(r.issued_at) : "—"}
        </span>
      ),
    },
    {
      key: "due_date",
      header: "Due",
      render: (r) => {
        if (!r.due_date) return <span className="text-[#a3a3a3]">—</span>;
        const overdue = r.due_date < today && r.status !== "paid" && r.status !== "void";
        return (
          <span className="font-mono tabular-nums text-[12px]">
            <span className={overdue ? "text-[#c5251c]" : "text-[#6e6e73]"}>
              {formatDate(r.due_date)}
            </span>
            <span className="block text-[11px] text-[#a3a3a3]">
              {formatRelativeDays(r.due_date)}
            </span>
          </span>
        );
      },
    },
    {
      key: "total",
      header: "Amount",
      align: "right",
      render: (r) => (
        <MoneyCell
          amount={Number(r.total ?? 0)}
          secondary={
            r.amount_paid && r.amount_paid > 0 && r.amount_paid < r.total
              ? Number(r.total) - Number(r.amount_paid)
              : undefined
          }
          secondaryLabel="due"
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "actions",
      header: "",
      width: "48px",
      render: (r) => (
        <RowActions
          items={[
            { label: "Open", href: `/app/money/invoices/${r.id}` },
            { label: "Send", onClick: () => setSendInvoice(r) },
            { separator: true },
            {
              label: "Delete",
              danger: true,
              onClick: () => handleDelete(r.id),
            },
          ]}
        />
      ),
    },
  ];

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this invoice? This cannot be undone.")) return;
    const res = await deleteInvoice(id);
    if (res.ok) {
      toast({ title: "Invoice deleted", variant: "success" });
      refetch();
      if (selectedId === id) setSelectedId(null);
    } else {
      toast({ title: res.error ?? "Delete failed", variant: "error" });
    }
  }

  return (
    <MoneyShell>
      <section className="relative -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-8 lg:px-10 pt-2 pb-6 bg-[#fbfbfd] overflow-hidden">
        <DotPattern
          size={24}
          className="absolute inset-0 opacity-[0.10]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-32 w-[640px] h-[640px] rounded-full bg-[#0071e3]/[0.07] blur-[120px]"
        />

        <div className="relative flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#86868b]">
              Receivables
            </p>
            <h2 className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
              Track receivables, send documents, request signatures.
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="md" href="#import">
              Import
            </Button>
            <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
              <span className="text-base leading-none">+</span> New invoice
            </Button>
          </div>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Outstanding"
            value={
              <span>{formatCurrency(kpis.outstanding, { whole: true })}</span>
            }
            sub={`across ${kpis.outstandingCount} ${kpis.outstandingCount === 1 ? "invoice" : "invoices"}`}
          />
          <StatCard
            label="Overdue"
            value={
              <span className={kpis.overdue > 0 ? "text-[#c5251c]" : undefined}>
                {formatCurrency(kpis.overdue, { whole: true })}
              </span>
            }
            sub={`${kpis.overdueCount} ${kpis.overdueCount === 1 ? "invoice" : "invoices"}`}
            delta={
              kpis.overdueCount > 0
                ? { value: `${kpis.overdueCount} due`, tone: "negative" }
                : undefined
            }
          />
          <StatCard
            label="Paid this month"
            value={<span>{formatCurrency(kpis.paidThisMonth, { whole: true })}</span>}
            sub="from collected payments"
          />
          <StatCard
            label="Avg days to pay"
            value={<span>{kpis.avgDays || "—"}</span>}
            sub="trailing 90 days"
          />
        </div>

        <div className="h-px mt-6 bg-gradient-to-r from-transparent via-[#0071e3]/20 to-transparent" />
      </section>

      <section className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 px-2 md:px-0 py-6">
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/3 -left-24 w-[520px] h-[520px] rounded-full bg-[#0071e3]/[0.06] blur-[140px] -z-10"
        />

        <div className="lg:col-span-7 space-y-4 min-w-0">
          <FilterBar
            chips={FILTER_CHIPS}
            active={filter}
            onChange={setFilter}
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search by number or client"
            density={density}
            onDensityChange={setDensity}
          />

          {error && <ErrorBanner message={error} onRetry={refetch} />}

          {loading ? (
            <div className="space-y-2">
              <Skeleton height={48} />
              <Skeleton height={56} />
              <Skeleton height={56} />
              <Skeleton height={56} />
              <Skeleton height={56} />
            </div>
          ) : (
            <DataTable<DbInvoice>
              columns={columns}
              data={filtered}
              rowKey={(r) => r.id}
              density={density}
              stickyHeader
              onRowClick={(r) => setSelectedId(r.id)}
              emptyState={
                invoices.length === 0 ? (
                  <EmptyState
                    icon="money"
                    title="No invoices yet"
                    description="Create your first invoice to start collecting."
                    action={
                      <Button variant="primary" onClick={() => setCreateOpen(true)}>
                        New invoice
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon="search"
                    title="No matches"
                    description="Try a different filter or search term."
                  />
                )
              }
            />
          )}
        </div>

        <div className="lg:col-span-5 lg:sticky lg:top-[72px] self-start">
          <DocumentPreviewRail
            selectedId={featured?.id ?? null}
            list={filtered.length > 0 ? filtered : invoices}
            onSend={(inv) => setSendInvoice(inv)}
          />
        </div>
      </section>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New invoice"
        description="Create a draft. You can send or edit it later."
        width={560}
      >
        <InvoiceForm
          onSuccess={(id) => {
            setCreateOpen(false);
            router.push(`/app/money/invoices/${id}`);
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </Drawer>

      <Drawer
        open={Boolean(sendInvoice)}
        onClose={() => setSendInvoice(null)}
        title={
          sendInvoice
            ? `Send invoice ${sendInvoice.invoice_number ?? sendInvoice.id.slice(0, 6)}`
            : ""
        }
        description="Email the invoice to the client and mark it sent."
      >
        {sendInvoice && (
          <SendDocumentModal
            documentId={sendInvoice.id}
            documentNumber={sendInvoice.invoice_number ?? undefined}
            type="invoice"
            mode="send"
            onSuccess={() => {
              setSendInvoice(null);
              refetch();
            }}
            onClose={() => setSendInvoice(null)}
          />
        )}
      </Drawer>
    </MoneyShell>
  );
}
