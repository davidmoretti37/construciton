"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MoneyShell from "@/components/app/money/MoneyShell";
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
import EstimateForm from "@/components/app/money/EstimateForm";
import SendDocumentModal from "@/components/app/money/SendDocumentModal";
import ESignStatusBadge from "@/components/app/money/ESignStatusBadge";
import { useEstimates } from "@/hooks/useEstimates";
import { deleteEstimate, convertEstimateToInvoice } from "@/app/actions/estimates";
import { useToast } from "@/components/ui/toast-provider";
import { formatDate } from "@/lib/format";
import type { DbEstimate } from "@/types/database";
import type { DensityMode } from "@/types";

const FILTER_CHIPS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
  { key: "converted", label: "Converted" },
];

export default function EstimatesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { estimates, signatures, loading, error, refetch } = useEstimates();

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [createOpen, setCreateOpen] = useState(false);
  const [esignFor, setEsignFor] = useState<DbEstimate | null>(null);
  const [editFor, setEditFor] = useState<DbEstimate | null>(null);

  const filtered = useMemo(() => {
    return estimates.filter((est) => {
      if (filter !== "all" && est.status !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !(est.estimate_number ?? "").toLowerCase().includes(q) &&
          !(est.client_id ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [estimates, filter, search]);

  async function handleConvert(id: string) {
    const res = await convertEstimateToInvoice(id);
    if (res.ok && res.invoiceId) {
      toast({ title: "Converted to invoice", variant: "success" });
      router.push(`/app/money/invoices/${res.invoiceId}`);
    } else {
      toast({ title: res.error ?? "Convert failed", variant: "error" });
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this estimate?")) return;
    const res = await deleteEstimate(id);
    if (res.ok) {
      toast({ title: "Estimate deleted", variant: "success" });
      refetch();
    } else {
      toast({ title: res.error ?? "Delete failed", variant: "error" });
    }
  }

  const columns: Column<DbEstimate>[] = [
    {
      key: "estimate_number",
      header: "Number",
      width: "140px",
      render: (r) => (
        <span className="font-mono tabular-nums text-[13px] text-[#1d1d1f]">
          {r.estimate_number}
        </span>
      ),
    },
    {
      key: "client_id",
      header: "Client",
      render: (r) =>
        r.client_id ? (
          <span className="font-mono text-[12px] text-[#6e6e73]">
            {r.client_id.slice(0, 8)}…
          </span>
        ) : (
          <span className="text-[#a3a3a3]">—</span>
        ),
    },
    {
      key: "created_at",
      header: "Issued",
      render: (r) => (
        <span className="font-mono tabular-nums text-[12px] text-[#6e6e73]">
          {r.created_at ? formatDate(r.created_at) : "—"}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (r) => <MoneyCell amount={Number(r.total ?? 0)} />,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "esign",
      header: "Signature",
      render: (r) => <ESignStatusBadge status={signatures[r.id]?.status ?? "none"} />,
    },
    {
      key: "actions",
      header: "",
      width: "48px",
      render: (r) => (
        <RowActions
          items={[
            { label: "Open", href: `/app/money/estimates/${r.id}` },
            { label: "Edit", onClick: () => setEditFor(r) },
            { label: "Request signature", onClick: () => setEsignFor(r) },
            { label: "Convert to invoice", onClick: () => handleConvert(r.id) },
            { separator: true },
            { label: "Delete", danger: true, onClick: () => handleDelete(r.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MoneyShell>
      <section className="relative -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-8 lg:px-10 pt-2 pb-6 bg-[#fbfbfd] overflow-hidden">
        <DotPattern size={24} className="absolute inset-0 opacity-[0.10]" />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/4 -right-24 w-[520px] h-[520px] rounded-full bg-[#0071e3]/[0.05] blur-[140px]"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#86868b]">
              Estimates
            </p>
            <h2 className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
              Quote, sign, and convert to invoice.
            </h2>
          </div>
          <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
            <span className="text-base leading-none">+</span> New estimate
          </Button>
        </div>
        <div className="h-px mt-6 bg-gradient-to-r from-transparent via-[#0071e3]/20 to-transparent" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 px-2 md:px-0 py-6">
        <div className="lg:col-span-12 space-y-4 min-w-0">
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
            </div>
          ) : (
            <DataTable<DbEstimate>
              columns={columns}
              data={filtered}
              rowKey={(r) => r.id}
              density={density}
              stickyHeader
              onRowClick={(r) => router.push(`/app/money/estimates/${r.id}`)}
              emptyState={
                estimates.length === 0 ? (
                  <EmptyState
                    icon="file"
                    title="No estimates yet"
                    description="Create an estimate to send to a client."
                    action={
                      <Button variant="primary" onClick={() => setCreateOpen(true)}>
                        New estimate
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
      </section>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New estimate"
        description="Create a draft. You can send or convert it later."
        width={560}
      >
        <EstimateForm
          onSuccess={(id) => {
            setCreateOpen(false);
            router.push(`/app/money/estimates/${id}`);
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </Drawer>

      <Drawer
        open={Boolean(editFor)}
        onClose={() => setEditFor(null)}
        title={editFor ? `Edit ${editFor.estimate_number}` : ""}
        description="Update line items, status, or totals."
        width={560}
      >
        {editFor && (
          <EstimateForm
            estimate={editFor}
            onSuccess={() => {
              setEditFor(null);
              refetch();
            }}
            onCancel={() => setEditFor(null)}
          />
        )}
      </Drawer>

      <Drawer
        open={Boolean(esignFor)}
        onClose={() => setEsignFor(null)}
        title="Request signature"
        description="Email a signing link to your client."
      >
        {esignFor && (
          <SendDocumentModal
            documentId={esignFor.id}
            documentNumber={esignFor.estimate_number}
            type="estimate"
            mode="esign"
            onSuccess={() => {
              setEsignFor(null);
              refetch();
            }}
            onClose={() => setEsignFor(null)}
          />
        )}
      </Drawer>
    </MoneyShell>
  );
}
