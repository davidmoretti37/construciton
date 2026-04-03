function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

interface Props {
  estimates: { draft: number; sent: number; accepted: number };
  invoices: { unpaid: number; partial: number; paid: number };
  contractValue: number;
}

function Pill({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${color}`}>
      {label} {count}
    </span>
  );
}

export default function PipelineCard({ estimates, invoices, contractValue }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Pipeline</h4>
      <p className="text-lg font-bold text-gray-900 mb-3">{fmt$(contractValue)}</p>

      <div className="space-y-2.5">
        <div>
          <p className="text-[10px] text-gray-400 uppercase mb-1">Estimates</p>
          <div className="flex flex-wrap gap-1">
            <Pill label="Draft" count={estimates.draft} color="bg-gray-100 text-gray-600" />
            <Pill label="Sent" count={estimates.sent} color="bg-blue-50 text-blue-600" />
            <Pill label="Won" count={estimates.accepted} color="bg-emerald-50 text-emerald-600" />
            {estimates.draft + estimates.sent + estimates.accepted === 0 && (
              <span className="text-[11px] text-gray-300">None</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase mb-1">Invoices</p>
          <div className="flex flex-wrap gap-1">
            <Pill label="Unpaid" count={invoices.unpaid} color="bg-red-50 text-red-600" />
            <Pill label="Partial" count={invoices.partial} color="bg-amber-50 text-amber-600" />
            <Pill label="Paid" count={invoices.paid} color="bg-emerald-50 text-emerald-600" />
            {invoices.unpaid + invoices.partial + invoices.paid === 0 && (
              <span className="text-[11px] text-gray-300">None</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
