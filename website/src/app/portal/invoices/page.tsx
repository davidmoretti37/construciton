"use client";

import { useEffect, useState } from "react";
import PortalShell from "@/components/portal/PortalShell";
import { fetchDashboard, payInvoice, type PortalInvoice } from "@/services/portal";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard()
      .then((data) => setInvoices(data.outstandingInvoices))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handlePay = async (invoiceId: string) => {
    try {
      const { url } = await payInvoice(invoiceId);
      window.location.href = url;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start payment");
    }
  };

  return (
    <PortalShell>
      <h1 className="text-lg font-bold text-gray-900 mb-4">Invoices</h1>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-gray-500">No outstanding invoices.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div key={inv.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{inv.invoice_number}</p>
                  <p className="text-xs text-gray-500">{inv.project_name}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  inv.status === "overdue" ? "bg-red-100 text-red-700" :
                  inv.status === "partial" ? "bg-amber-100 text-amber-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {inv.status}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(inv.amount_due)}</p>
                  <p className="text-xs text-gray-500">Due: {formatDate(inv.due_date)}</p>
                </div>
                <button
                  onClick={() => handlePay(inv.id)}
                  className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg transition-colors"
                >
                  Pay Now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
