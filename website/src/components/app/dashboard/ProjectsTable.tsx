interface Project {
  name: string;
  status: string;
  contract_amount: number;
  income_collected: number;
  expenses: number;
}

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const statusColors: Record<string, string> = {
  active: "bg-blue-50 text-blue-700",
  in_progress: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  on_hold: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-50 text-red-600",
};

export default function ProjectsTable({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Active Projects</h3>
        <p className="text-sm text-gray-400 text-center py-4">No projects yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Active Projects</h3>
        <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
          {projects.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-5 py-2.5">Project</th>
              <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-2.5">Status</th>
              <th className="text-right text-[11px] text-gray-400 uppercase tracking-wider font-medium px-3 py-2.5">Budget</th>
              <th className="text-right text-[11px] text-gray-400 uppercase tracking-wider font-medium px-5 py-2.5">Collected</th>
            </tr>
          </thead>
          <tbody>
            {projects.slice(0, 8).map((p, i) => {
              const pct = p.contract_amount > 0 ? (p.income_collected / p.contract_amount) * 100 : 0;
              return (
                <tr key={`${p.name}-${i}`} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColors[p.status] || statusColors.active}`}>
                      {p.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="text-sm text-gray-600">{fmt$(p.contract_amount)}</p>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <p className="text-sm text-gray-900 font-medium">{fmt$(p.income_collected)}</p>
                    <div className="w-16 h-1 bg-gray-100 rounded-full mt-1 ml-auto">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
