"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MoneyShell from "@/components/app/money/MoneyShell";
import StatusBadge from "@/components/ui/StatusBadge";
import Button from "@/components/ui/Button";
import ActionGroup from "@/components/ui/ActionGroup";
import MoneyCell from "@/components/ui/MoneyCell";
import ProgressBar from "@/components/ui/ProgressBar";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import ErrorBanner from "@/components/ui/ErrorBanner";
import DataTable, { type Column } from "@/components/ui/DataTable";
import DotPattern from "@/components/ui/DotPattern";
import BorderBeam from "@/components/ui/BorderBeam";
import Drawer from "@/components/ui/Drawer";
import InvoiceForm from "@/components/app/money/InvoiceForm";
import SendDocumentModal from "@/components/app/money/SendDocumentModal";
import { useToast } from "@/components/ui/toast-provider";
import { createClient } from "@/lib/supabase-browser";
import { useAuth } from "@/contexts/AuthContext";
import { deleteInvoice, sendInvoice } from "@/app/actions/invoices";
import { listPaymentEvents } from "@/app/actions/payment-events";
import { formatCurrency, formatDate, formatRelativeDays } from "@/lib/format";
import type { DbInvoice, DbInvoiceLineItem, DbPaymentEvent } from "@/types/database";

interface LineRow {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const [invoice, setInvoice] = useState<DbInvoice | null>(null);
  const [events, setEvents] = useState<DbPaymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setInvoice(data as DbInvoice);
    setLoading(false);
    const ev = await listPaymentEvents(id);
    setEvents(ev);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`invoice-detail:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
          filter: `id=eq.${id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  async function handleSend() {
    setSendOpen(true);
  }

  async function handleQuickSend() {
    const res = await sendInvoice(id, undefined, new FormData());
    if (res.ok) {
      toast({ title: "Invoice marked sent", variant: "success" });
      load();
    } else {
      toast({ title: res.error ?? "Send failed", variant: "error" });
    }
  }

  async function handleMarkPaid() {
    if (!invoice) return;
    const supabase = createClient();
    const { error: err } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        amount_paid: invoice.total,
        paid_at: new Date().toISOString().slice(0, 10),
      })
      .eq("id", invoice.id);
    if (err) {
      toast({ title: err.message, variant: "error" });
    } else {
      toast({ title: "Marked paid", variant: "success" });
      load();
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this invoice?")) return;
    const res = await deleteInvoice(id);
    if (res.ok) {
      toast({ title: "Invoice deleted", variant: "success" });
      router.push("/app/money/invoices");
    } else {
      toast({ title: res.error ?? "Delete failed", variant: "error" });
    }
  }

  const overdue =
    invoice &&
    invoice.due_date &&
    invoice.due_date < new Date().toISOString().slice(0, 10) &&
    invoice.status !== "paid" &&
    invoice.status !== "void";

  const total = Number(invoice?.total ?? 0);
  const paid = Number(invoice?.amount_paid ?? 0);
  const paidPct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;

  const lineItems: LineRow[] = (invoice?.line_items ?? []).map((li: DbInvoiceLineItem) => ({
    description: li.description ?? "",
    quantity: Number(li.quantity ?? 0),
    unit_price: Number(li.unit_price ?? 0),
    amount: Number(li.amount ?? Number(li.quantity ?? 0) * Number(li.unit_price ?? 0)),
  }));

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

  if (loading && !invoice) {
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

  if (error || !invoice) {
    return (
      <MoneyShell>
        <div className="px-2 md:px-0 py-6">
          <ErrorBanner message={error ?? "Invoice not found"} onRetry={load} />
          <Link
            href="/app/money/invoices"
            className="inline-block mt-4 text-[13px] text-[#0071e3] hover:underline"
          >
            ← Back to invoices
          </Link>
        </div>
      </MoneyShell>
    );
  }

  const number = invoice.invoice_number ?? `#${invoice.id.slice(0, 6)}`;

  return (
    <MoneyShell>
      <section className="relative -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-8 lg:px-10 pt-2 pb-8 bg-[#fbfbfd] overflow-hidden">
        <DotPattern size={24} className="absolute inset-0 opacity-[0.10]" />
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 -right-32 w-[600px] h-[600px] rounded-full bg-[#0071e3]/[0.08] blur-[140px]"
        />

        <div className="relative">
          <nav className="text-[12px] text-[#86868b] flex items-center gap-1.5 mb-3">
            <Link href="/app/money/invoices" className="hover:text-[#1d1d1f] transition-colors">
              Money
            </Link>
            <span>/</span>
            <Link href="/app/money/invoices" className="hover:text-[#1d1d1f] transition-colors">
              Invoices
            </Link>
            <span>/</span>
            <span className="text-[#1d1d1f] font-mono tabular-nums">{number}</span>
          </nav>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="relative">
              <div className="relative bg-white ring-1 ring-[#e5e5ea] rounded-2xl px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-3">
                  <h1 className="font-mono text-[28px] font-semibold tabular-nums tracking-tight text-[#1d1d1f]">
                    {number}
                  </h1>
                  <StatusBadge status={invoice.status} />
                </div>
                <p className="mt-1 text-[13px] text-[#6e6e73]">
                  {formatCurrency(total, { whole: true })} ·{" "}
                  {invoice.due_date ? `due ${formatRelativeDays(invoice.due_date)}` : "no due date"}
                </p>
                {overdue && (
                  <BorderBeam
                    duration={6}
                    colorFrom="#ff3b30"
                    colorTo="#ff9500"
                    borderRadius={16}
                  />
                )}
              </div>
            </div>

            <ActionGroup
              primary={
                <Button variant="primary" onClick={handleSend}>
                  Send
                </Button>
              }
              secondary={
                <>
                  <Button variant="ghost" onClick={() => setEditOpen(true)}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={handleMarkPaid}>
                    Mark paid
                  </Button>
                </>
              }
              overflow={[
                { label: "Quick send (mark sent)", onClick: handleQuickSend },
                { label: "Duplicate", onClick: () => toast({ title: "Coming soon" }) },
                { separator: true },
                { label: "Delete", danger: true, onClick: handleDelete },
              ]}
            />
          </div>
        </div>

        <div className="h-px mt-6 bg-gradient-to-r from-transparent via-[#e5e5ea] to-transparent" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 px-2 md:px-0 py-8">
        <aside className="lg:col-span-4 lg:sticky lg:top-[72px] self-start space-y-4">
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#86868b] mb-3">
              Summary
            </p>
            <MetaRow label="Issued" value={invoice.issued_at ? formatDate(invoice.issued_at) : "—"} />
            <MetaRow label="Due" value={invoice.due_date ? formatDate(invoice.due_date) : "—"} />
            <MetaRow
              label="Project"
              value={
                invoice.project_id ? (
                  <Link
                    href={`/app/work/projects/${invoice.project_id}`}
                    className="text-[#0071e3] hover:underline font-mono text-[12px]"
                  >
                    {invoice.project_id.slice(0, 8)}…
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <MetaRow
              label="Client"
              value={
                invoice.client_id ? (
                  <span className="font-mono text-[12px] text-[#1d1d1f]">
                    {invoice.client_id.slice(0, 8)}…
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <div className="border-t border-[#e5e5ea] mt-4 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#86868b] mb-2">
                Amount
              </p>
              <MoneyCell
                amount={total}
                secondary={paid}
                secondaryLabel="paid"
                className="!items-start"
              />
              <div className="mt-3">
                <ProgressBar value={paidPct} showLabel />
              </div>
            </div>
          </div>
        </aside>

        <div className="lg:col-span-8 space-y-6 relative">
          <DotPattern
            size={24}
            className="absolute inset-0 opacity-[0.06] -z-10"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-1/3 w-[420px] h-[420px] rounded-full bg-[#34c759]/[0.05] blur-[140px] -z-10"
          />

          <article className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]">
            <h2 className="text-[15px] font-semibold text-[#1d1d1f] mb-4">Line items</h2>
            {lineItems.length > 0 ? (
              <DataTable<LineRow & { _key: string }>
                columns={lineCols as Column<LineRow & { _key: string }>[]}
                data={lineItems.map((l, i) => ({ ...l, _key: `line-${i}` }))}
                rowKey={(r) => r._key}
                density="compact"
                className="!shadow-none !ring-0 !rounded-none border-t border-[#e5e5ea]"
              />
            ) : (
              <EmptyState
                icon="file"
                title="No line items"
                description="Edit this invoice to add line items."
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

          <div className="h-px bg-gradient-to-r from-transparent via-[#0071e3]/20 to-transparent" />

          <article className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]">
            <h2 className="text-[15px] font-semibold text-[#1d1d1f] mb-4">Payment events</h2>
            {events.length > 0 ? (
              <ol className="space-y-4">
                {events.map((ev) => (
                  <li key={ev.id} className="flex gap-3 items-start">
                    <span
                      className={`shrink-0 mt-1.5 inline-block w-2 h-2 rounded-full ${
                        ev.kind === "payment"
                          ? "bg-[#34c759]"
                          : ev.kind === "refund"
                            ? "bg-[#ff3b30]"
                            : "bg-[#0071e3]"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[13px] font-medium text-[#1d1d1f] capitalize">
                          {ev.kind}
                        </span>
                        <span className="font-mono text-[13px] tabular-nums text-[#1d1d1f]">
                          {ev.kind === "refund" ? "-" : ""}
                          {formatCurrency(Number(ev.amount ?? 0), { whole: true })}
                        </span>
                      </div>
                      <p className="text-[12px] text-[#6e6e73]">
                        {formatDate(ev.occurred_at)} · {formatRelativeDays(ev.occurred_at)}
                      </p>
                      {ev.note && (
                        <p className="mt-1 text-[12px] text-[#6e6e73]">{ev.note}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                icon="inbox"
                title="No events yet"
                description="Payments and reminders will appear here."
                variant="compact"
              />
            )}
          </article>
        </div>
      </section>

      <Drawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit ${number}`}
        description="Changes save immediately."
        width={560}
      >
        <InvoiceForm
          invoice={invoice}
          onSuccess={() => {
            setEditOpen(false);
            load();
          }}
          onCancel={() => setEditOpen(false)}
        />
      </Drawer>

      <Drawer
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title={`Send invoice ${number}`}
        description="Email this invoice to your client."
      >
        <SendDocumentModal
          documentId={invoice.id}
          documentNumber={invoice.invoice_number ?? undefined}
          type="invoice"
          mode="send"
          onSuccess={() => {
            setSendOpen(false);
            load();
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
