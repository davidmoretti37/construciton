interface Alert {
  key: string;
  text: string;
  color: string;
}

export default function AlertsCard({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Alerts</h4>
        <div className="flex items-center gap-2 text-emerald-600">
          <span className="text-sm">✓</span>
          <span className="text-sm font-medium">All clear</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Alerts</h4>
      <div className="space-y-2">
        {alerts.map((a) => (
          <div
            key={a.key}
            className={`flex items-start gap-2.5 p-2.5 rounded-lg text-sm ${
              a.color === "red" ? "bg-red-50 border-l-2 border-red-400" : "bg-amber-50 border-l-2 border-amber-400"
            }`}
          >
            <span className="text-xs mt-0.5">{a.color === "red" ? "●" : "▲"}</span>
            <span className={a.color === "red" ? "text-red-700" : "text-amber-700"}>{a.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
