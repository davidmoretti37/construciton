"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MoneyShell from "@/components/app/money/MoneyShell";
import DotPattern from "@/components/ui/DotPattern";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import ErrorBanner from "@/components/ui/ErrorBanner";
import Button from "@/components/ui/Button";
import RowActions from "@/components/ui/RowActions";
import Drawer from "@/components/ui/Drawer";
import ContractEditor from "@/components/app/money/ContractEditor";
import ESignStatusBadge from "@/components/app/money/ESignStatusBadge";
import { useContracts } from "@/hooks/useContracts";
import { deleteContract } from "@/app/actions/contracts";
import { useToast } from "@/components/ui/toast-provider";
import { formatDate } from "@/lib/format";
import type { DbContract } from "@/types/database";
import type { DensityMode } from "@/types";

const FILTER_CHIPS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "signed", label: "Signed" },
  { key: "declined", label: "Declined" },
];

export default function ContractsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    contracts,
    templates,
    signatures,
    loading,
    available,
    error,
    refetch,
  } = useContracts();

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !(c.title ?? "").toLowerCase().includes(q) &&
          !(c.client_id ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [contracts, filter, search]);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this contract?")) return;
    const res = await deleteContract(id);
    if (res.ok) {
      toast({ title: "Contract deleted", variant: "success" });
      refetch();
    } else {
      toast({ title: res.error ?? "Delete failed", variant: "error" });
    }
  }

  const columns: Column<DbContract>[] = [
    {
      key: "title",
      header: "Title",
      render: (r) => (
        <span className="text-[13px] text-[#1d1d1f] font-medium">
          {r.title ?? <span className="text-[#a3a3a3] italic">Untitled</span>}
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
      header: "Created",
      render: (r) => (
        <span className="font-mono tabular-nums text-[12px] text-[#6e6e73]">
          {r.created_at ? formatDate(r.created_at) : "—"}
        </span>
      ),
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
            { label: "Open", href: `/app/money/contracts/${r.id}` },
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
          className="pointer-events-none absolute top-1/4 -right-24 w-[520px] h-[520px] rounded-full bg-[#0071e3]/[0.06] blur-[140px]"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#86868b]">
              Contracts
            </p>
            <h2 className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
              Draft, send, and collect signatures.
            </h2>
          </div>
          {available && (
            <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
              <span className="text-base leading-none">+</span> New contract
            </Button>
          )}
        </div>
        <div className="h-px mt-6 bg-gradient-to-r from-transparent via-[#0071e3]/20 to-transparent" />
      </section>

      <section className="grid grid-cols-1 gap-6 px-2 md:px-0 py-6">
        {!available ? (
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl">
            <EmptyState
              icon="folder-open"
              title="Contracts coming soon"
              description="Tables are not provisioned for this deployment yet. Reach out if you need this enabled."
            />
          </div>
        ) : (
          <>
            <FilterBar
              chips={FILTER_CHIPS}
              active={filter}
              onChange={setFilter}
              search={search}
              onSearch={setSearch}
              searchPlaceholder="Search by title or client"
              density={density}
              onDensityChange={setDensity}
            />

            {error && <ErrorBanner message={error} onRetry={refetch} />}

            {loading ? (
              <div className="space-y-2">
                <Skeleton height={48} />
                <Skeleton height={56} />
                <Skeleton height={56} />
              </div>
            ) : (
              <DataTable<DbContract>
                columns={columns}
                data={filtered}
                rowKey={(r) => r.id}
                density={density}
                stickyHeader
                onRowClick={(r) => router.push(`/app/money/contracts/${r.id}`)}
                emptyState={
                  contracts.length === 0 ? (
                    <EmptyState
                      icon="file"
                      title="No contracts yet"
                      description="Draft a contract to send for signature."
                      action={
                        <Button variant="primary" onClick={() => setCreateOpen(true)}>
                          New contract
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
          </>
        )}
      </section>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New contract"
        description="Start from a template or write from scratch."
        width={640}
      >
        <ContractEditor
          templates={templates}
          onSuccess={(id) => {
            setCreateOpen(false);
            router.push(`/app/money/contracts/${id}`);
          }}
        />
      </Drawer>
    </MoneyShell>
  );
}
