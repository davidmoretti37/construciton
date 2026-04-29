"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MoneyShell from "@/components/app/money/MoneyShell";
import StatusBadge from "@/components/ui/StatusBadge";
import Button from "@/components/ui/Button";
import ActionGroup from "@/components/ui/ActionGroup";
import MoneyCell from "@/components/ui/MoneyCell";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import ErrorBanner from "@/components/ui/ErrorBanner";
import DataTable, { type Column } from "@/components/ui/DataTable";
import DotPattern from "@/components/ui/DotPattern";
import Drawer from "@/components/ui/Drawer";
import EstimateForm from "@/components/app/money/EstimateForm";
import SendDocumentModal from "@/components/app/money/SendDocumentModal";
import ESignStatusBadge from "@/components/app/money/ESignStatusBadge";
import { useToast } from "@/components/ui/toast-provider";
import { createClient } from "@/lib/supabase-browser";
import { useAuth } from "@/contexts/AuthContext";
import { deleteEstimate, convertEstimateToInvoice } from "@/app/actions/estimates";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DbEstimate, DbInvoiceLineItem, DbSignature } from "@/types/database";

interface LineRow {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  _key: string;
}

export default function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const [estimate, setEstimate] = useState<DbEstimate | null>(null);
  const [signature, setSignature] = useState<DbSignature | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [esignOpen, setEsignOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const [estRes, sigRes] = await Promise.all([
      supabase
        .from("estimates")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("signatures")
        .select("*")
        .eq("document_id", id)
        .eq("document_type", "estimate")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (estRes.error) {
      setError(estRes.error.message);
      setLoading(false);
      return;
    }
    setEstimate(estRes.data as DbEstimate);
    if (!sigRes.error && sigRes.data) {
      setSignature(sigRes.data as DbSignature);
    } else {
      setSignature(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`estimate-detail:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "estimates",
          filter: `id=eq.${id}`,
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "signatures",
          filter: `document_id=eq.${id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  async function handleConvert() {
    if (!estimate) return;
    const res = await convertEstimateToInvoice(estimate.id);
    if (res.ok && res.invoiceId) {
      toast({ title: "Converted to invoice", variant: "success" });
      router.push(`/app/money/invoices/${res.invoiceId}`);
    } else {
      toast({ title: res.error ?? "Convert failed", variant: "error" });
    }
  }

  async function handleDelete() {
    if (!estimate) return;
    if (!window.confirm("Delete this estimate?")) return;
    const res = await deleteEstimate(estimate.id);
    if (res.ok) {
      toast({ title: "Estimate deleted", variant: "success" });
      router.push("/app/money/estimates");
    } else {
      toast({ title: res.error ?? "Delete failed", variant: "error" });
    }
  }

  const total = Number(estimate?.total ?? 0);
  const lineItems: LineRow[] = (estimate?.line_items ?? []).map(
    (li: DbInvoiceLineItem, i) => ({
      description: li.description ?? "",
      quantity: Number(li.quantity ?? 0),
      unit_price: Number(li.unit_price ?? 0),
      amount: Number(li.amount ?? Number(li.quantity ?? 0) * Number(li.unit_price ?? 0)),
      _key: `line-${i}`,
    }),
  );

  const subtotal = lineItems.reduce((s, l) => s + l.amount, 0);

  const lineCols: Column<LineRow>[] = [
    {
      key: "description",
      header: "Description",
      render: (r) => <span className="text-[13px] text-[#1d1d1f]">{r.description}</span>,
    },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      width: "80px",
      render: (r) => (
        <span className="font-mono tabular-nums text-[13px] text-[#6e6e73]">
          {r.quantity}
        </span>
      ),
    },
    {
      key: "unit_price",
      header: "Unit",
      align: "right",
      width: "120px",
      render: (r) => (
        <span className="font-mono tabular-nums text-[13px] text-[#6e6e73]">
          {formatCurrency(r.unit_price)}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Total",
      align: "right",
      width: "120px",
      render: (r) => (
        <span className="font-mono tabular-nums text-[13px] text-[#1d1d1f]">
          {formatCurrency(r.amount)}
        </span>
      ),
    },
  ];

  if (loading && !estimate) {
    return (
      <MoneyShell>
        <div className="px-2 md:px-0 py-6 space-y-4">
          <Skeleton height={32} width={240} />
          <Skeleton height={120} />
          <Skeleton height={240} />
        </div>
      </MoneyShell>
    );
  }

  if (error || !estimate) {
    return (
      <MoneyShell>
        <div className="px-2 md:px-0 py-6">
          <ErrorBanner message={error ?? "Estimate not found"} onRetry={load} />
          <Link
            href="/app/money/estimates"
            className="inline-block mt-4 text-[13px] text-[#0071e3] hover:underline"
          >
            ← Back to estimates
          </Link>
        </div>
      </MoneyShell>
    );
  }

  return (
    <MoneyShell>
      <section className="relative -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-8 lg:px-10 pt-2 pb-8 bg-[#fbfbfd] overflow-hidden">
        <DotPattern size={24} className="absolute inset-0 opacity-[0.10]" />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/4 -right-24 w-[520px] h-[520px] rounded-full bg-[#0071e3]/[0.05] blur-[140px]"
        />

        <div className="relative">
          <nav className="text-[12px] text-[#86868b] flex items-center gap-1.5 mb-3">
            <Link href="/app/money/estimates" className="hover:text-[#1d1d1f] transition-colors">
              Money
            </Link>
            <span>/</span>
            <Link href="/app/money/estimates" className="hover:text-[#1d1d1f] transition-colors">
              Estimates
            </Link>
            <span>/</span>
            <span className="text-[#1d1d1f] font-mono tabular-nums">
              {estimate.estimate_number}
            </span>
          </nav>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-3">
                <h1 className="font-mono text-[28px] font-semibold tabular-nums tracking-tight text-[#1d1d1f]">
                  {estimate.estimate_number}
                </h1>
                <StatusBadge status={estimate.status} />
                <ESignStatusBadge status={signature?.status ?? "none"} />
              </div>
              <p className="mt-1 text-[13px] text-[#6e6e73]">
                {formatCurrency(total, { whole: true })} ·{" "}
                {estimate.created_at ? `created ${formatDate(estimate.created_at)}` : ""}
              </p>
            </div>

            <ActionGroup
              primary={
                <Button variant="primary" onClick={handleConvert}>
                  Convert to invoice
                </Button>
              }
              secondary={
                <>
                  <Button variant="ghost" onClick={() => setEsignOpen(true)}>
                    Request signature
                  </Button>
                  <Button variant="ghost" onClick={() => setEditOpen(true)}>
                    Edit
                  </Button>
                </>
              }
              overflow={[
                { label: "Send copy", onClick: () => setSendOpen(true) },
                { separator: true },
                { label: "Delete", danger: true, onClick: handleDelete },
              ]}
            />
          </div>
        </div>

        <div className="h-px mt-6 bg-gradient-to-r from-transparent via-[#0071e3]/20 to-transparent" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 px-2 md:px-0 py-8">
        <aside className="lg:col-span-4 lg:sticky lg:top-[72px] self-start space-y-4">
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#86868b] mb-3">
              Summary
            </p>
            <MetaRow
              label="Created"
              value={estimate.created_at ? formatDate(estimate.created_at) : "—"}
            />
            <MetaRow
              label="Project"
              value={
                estimate.project_id ? (
                  <Link
                    href={`/app/work/projects/${estimate.project_id}`}
                    className="text-[#0071e3] hover:underline font-mono text-[12px]"
                  >
                    {estimate.project_id.slice(0, 8)}…
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <MetaRow
              label="Client"
              value={
                estimate.client_id ? (
                  <span className="font-mono text-[12px] text-[#1d1d1f]">
                    {estimate.client_id.slice(0, 8)}…
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <div className="border-t border-[#e5e5ea] mt-4 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#86868b] mb-2">
                Total
              </p>
              <MoneyCell amount={total} className="!items-start" />
            </div>
            {signature && (
              <div className="border-t border-[#e5e5ea] mt-4 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#86868b] mb-2">
                  Signature
                </p>
                <div className="space-y-2 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6e6e73]">Status</span>
                    <ESignStatusBadge status={signature.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#6e6e73]">Signer</span>
                    <span className="text-[#1d1d1f]">{signature.signer_name ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#6e6e73]">Email</span>
                    <span className="font-mono text-[12px] text-[#1d1d1f] truncate">
                      {signature.signer_email}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="lg:col-span-8 space-y-6">
          <article className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]">
            <h2 className="text-[15px] font-semibold text-[#1d1d1f] mb-4">Line items</h2>
            {lineItems.length > 0 ? (
              <DataTable<LineRow>
                columns={lineCols}
                data={lineItems}
                rowKey={(r) => r._key}
                density="compact"
                className="!shadow-none !ring-0 !rounded-none border-t border-[#e5e5ea]"
              />
            ) : (
              <EmptyState
                icon="file"
                title="No line items"
                description="Edit this estimate to add line items."
                variant="compact"
              />
            )}
            {lineItems.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#e5e5ea] grid grid-cols-2 gap-2 text-[13px]">
                <span className="text-[#6e6e73]">Subtotal</span>
                <span className="text-right font-mono tabular-nums text-[#1d1d1f]">
                  {formatCurrency(subtotal)}
                </span>
                <span className="text-[#6e6e73]">Total</span>
                <span className="text-right font-mono tabular-nums font-semibold text-[#1d1d1f]">
                  {formatCurrency(total)}
                </span>
              </div>
            )}
          </article>
        </div>
      </section>

      <Drawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit ${estimate.estimate_number}`}
        description="Update line items, status, or totals."
        width={560}
      >
        <EstimateForm
          estimate={estimate}
          onSuccess={() => {
            setEditOpen(false);
            load();
          }}
          onCancel={() => setEditOpen(false)}
        />
      </Drawer>

      <Drawer
        open={esignOpen}
        onClose={() => setEsignOpen(false)}
        title="Request signature"
        description="Email a signing link to your client."
      >
        <SendDocumentModal
          documentId={estimate.id}
          documentNumber={estimate.estimate_number}
          type="estimate"
          mode="esign"
          onSuccess={() => {
            setEsignOpen(false);
            load();
          }}
          onClose={() => setEsignOpen(false)}
        />
      </Drawer>

      <Drawer
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title={`Send ${estimate.estimate_number}`}
        description="Email this estimate to the client."
      >
        <SendDocumentModal
          documentId={estimate.id}
          documentNumber={estimate.estimate_number}
          type="estimate"
          mode="send"
          onSuccess={() => {
            setSendOpen(false);
          }}
          onClose={() => setSendOpen(false)}
        />
      </Drawer>
    </MoneyShell>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[12px] text-[#6e6e73]">{label}</span>
      <span className="text-[13px] text-[#1d1d1f]">{value}</span>
    </div>
  );
}
