"use client";

import type { PortalMilestonesData } from "@/services/portal";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);
}

interface Props {
  data: PortalMilestonesData;
  onPayInvoice: (invoiceId: string) => void;
}

export default function MilestoneTracker({ data, onPayInvoice }: Props) {
  const totalPaid = data.milestones.reduce((sum, m) => {
    if (m.invoice?.status === "paid") return sum + (m.invoice.total || 0);
    if (m.invoice?.amount_paid) return sum + m.invoice.amount_paid;
    return sum;
  }, 0);

  const progressPercent = data.contract_amount > 0
    ? Math.min(100, Math.round((totalPaid / data.contract_amount) * 100))
    : 0;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Payment Milestones</h2>
      <p className="text-xs text-gray-500 mb-4">
        {formatCurrency(totalPaid)} of {formatCurrency(data.contract_amount)} paid ({progressPercent}%)
      </p>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-2.5 mb-5">
        <div
          className="h-2.5 rounded-full bg-gradient-to-r from-green-500 to-green-400 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Milestones */}
      <div className="space-y-3">
        {data.milestones.map((milestone) => {
          const isPaid = milestone.invoice?.status === "paid";
          const isDue = milestone.invoiced && !isPaid && milestone.invoice;
          const isUpcoming = !milestone.invoiced;

          return (
            <div
              key={milestone.phase_id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                isPaid ? "border-green-200 bg-green-50" :
                isDue ? "border-amber-200 bg-amber-50" :
                "border-gray-100 bg-gray-50"
              }`}
            >
              {/* Status icon */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                isPaid ? "bg-green-500" :
                isDue ? "bg-amber-500" :
                "bg-gray-300"
              }`}>
                {isPaid ? (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-[10px] font-bold text-white">{milestone.order + 1}</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{milestone.name}</p>
                <p className="text-xs text-gray-500">
                  {milestone.payment_amount ? formatCurrency(milestone.payment_amount) : "—"}
                  {isPaid && " · Paid"}
                  {isDue && " · Due"}
                  {isUpcoming && " · Upcoming"}
                </p>
              </div>

              {/* Pay button */}
              {isDue && milestone.invoice && (
                <button
                  onClick={() => onPayInvoice(milestone.invoice!.id)}
                  className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  Pay {formatCurrency(milestone.invoice.amount_due)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
