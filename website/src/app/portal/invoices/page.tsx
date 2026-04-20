"use client";

import { useEffect, useState } from "react";
import PortalShell from "@/components/portal/PortalShell";
import { useToast } from "@/components/portal/Toast";
import { fetchAllInvoices, payInvoice, type PortalInvoice } from "@/services/portal";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(amount);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type Tab = "outstanding" | "paid";

export default function PortalInvoicesPage() {
  const [allInvoices, setAllInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("outstanding");
  const { toast } = useToast();

  const loadInvoices = () => {
    setError("");
    setLoading(true);
    fetchAllInvoices()
      .then(setAllInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load invoices"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const outstanding = allInvoices.filter((inv) => ["unpaid", "partial", "overdue", "sent"].includes(inv.status));
  const paid = allInvoices.filter((inv) => inv.status === "paid");
  const invoices = tab === "outstanding" ? outstanding : paid;

  const handlePay = async (invoiceId: string) => {
    try {
      const { url } = await payInvoice(invoiceId);
      window.location.href = url;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to start payment", "error");
    }
  };

  function statusBadge(status: string) {
    switch (status) {
      case "overdue":
        return "bg-red-100 text-red-700";
      case "partial":
        return "bg-amber-100 text-amber-700";
      case "paid":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  }

  return (
    <PortalShell>
      <h1 className="text-lg font-bold text-gray-900 mb-4">Invoices</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-4">
        <button
          onClick={() => setTab("outstanding")}
          className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors ${
            tab === "outstanding" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Outstanding{!loading && outstanding.length > 0 ? ` (${outstanding.length})` : ""}
        </button>
        <button
          onClick={() => setTab("paid")}
          className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors ${
            tab === "paid" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Payment History{!loading && paid.length > 0 ? ` (${paid.length})` : ""}
        </button>
      </div>

      {error ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm text-red-500 mb-2">{error}</p>
          <button
            onClick={loadInvoices}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <div className="h-4 bg-gray-200 rounded w-28" />
                  <div className="h-3 bg-gray-100 rounded w-20" />
                </div>
                <div className="h-5 bg-gray-100 rounded-full w-14" />
              </div>
              <div className="flex items-center justify-between">
                <div className="h-4 bg-gray-200 rounded w-16" />
                <div className="h-8 bg-gray-100 rounded-lg w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">
            {tab === "outstanding" ? "No outstanding invoices — you\u2019re all caught up!" : "No payment history yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Outstanding total banner */}
          {tab === "outstanding" && outstanding.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-1">
              <p className="text-xs text-amber-700">Total due</p>
              <p className="text-lg font-bold text-amber-900">
                {formatCurrency(outstanding.reduce((sum, inv) => sum + (inv.amount_due || inv.total - (inv.amount_paid || 0)), 0))}
              </p>
            </div>
          )}

          {invoices.map((inv) => (
            <div key={inv.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{inv.invoice_number}</p>
                  <p className="text-xs text-gray-500">{inv.project_name}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusBadge(inv.status)}`}>
                  {inv.status}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  {tab === "outstanding" ? (
                    <>
                      <p className="text-sm font-bold text-gray-900">
                        {formatCurrency(inv.amount_due || inv.total - (inv.amount_paid || 0))}
                      </p>
                      <p className="text-xs text-gray-500">Due: {formatDate(inv.due_date)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(inv.total)}</p>
                      <p className="text-xs text-gray-500">
                        Paid: {inv.paid_date ? formatDate(inv.paid_date) : "—"}
                      </p>
                    </>
                  )}
                </div>
                {tab === "outstanding" && (
                  <button
                    onClick={() => handlePay(inv.id)}
                    className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg transition-colors"
                  >
                    Pay Now
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
