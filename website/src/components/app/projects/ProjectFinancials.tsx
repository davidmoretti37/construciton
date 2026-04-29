"use client";

import StatCard from "@/components/app/dashboard/StatCard";
import Sparkline from "@/components/ui/Sparkline";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/format";
import type { ProjectDetail, Estimate } from "@/services/projectDetail";

interface Props {
  project: ProjectDetail;
}

function deriveSeries(seed: number): number[] {
  return Array.from({ length: 7 }, (_, i) => 0.5 + 0.5 * Math.abs(Math.cos(seed + i)));
}

const estColumns: Column<Estimate>[] = [
  {
    key: "number",
    header: "Estimate",
    render: (e) => (
      <span className="text-[13px] font-medium text-[#1d1d1f]">
        {e.estimate_number || `Estimate`}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (e) => <StatusBadge status={e.status} />,
  },
  {
    key: "total",
    header: "Total",
    align: "right",
    render: (e) => (
      <span className="text-[13px] font-mono tabular-nums text-[#1d1d1f]">
        {formatCurrency(e.total, { whole: true })}
      </span>
    ),
  },
  {
    key: "created",
    header: "Created",
    align: "right",
    render: (e) => (
      <span className="text-[12px] text-[#86868b] font-mono tabular-nums">
        {new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>
    ),
  },
];

export default function ProjectFinancials({ project }: Props) {
  const outstanding = Math.max(project.contract_amount - project.income_collected, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] font-semibold tracking-tight text-[#1d1d1f]">
          Financials
        </h3>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[#34c759] font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" />
          Live
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Contract"
          value={formatCurrency(project.contract_amount, { whole: true })}
          sub="total value"
        >
          <Sparkline data={deriveSeries(project.contract_amount + 1)} />
        </StatCard>
        <StatCard
          label="Collected"
          value={formatCurrency(project.income_collected, { whole: true })}
          sub={`${
            project.contract_amount > 0
              ? ((project.income_collected / project.contract_amount) * 100).toFixed(0)
              : 0
          }% of contract`}
        >
          <Sparkline data={deriveSeries(project.income_collected + 2)} stroke="#34c759" />
        </StatCard>
        <StatCard
          label="Outstanding"
          value={formatCurrency(outstanding, { whole: true })}
          sub={outstanding > 0 ? "to be invoiced" : "All collected"}
        >
          <Sparkline data={deriveSeries(outstanding + 3)} stroke="#ff9500" />
        </StatCard>
      </div>

      <section>
        <h4 className="text-[14px] font-medium text-[#1d1d1f] mb-3">Estimates</h4>
        {project.estimates.length === 0 ? (
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl">
            <EmptyState
              icon="money"
              title="No estimates yet"
              variant="compact"
            />
          </div>
        ) : (
          <DataTable
            columns={estColumns}
            data={project.estimates}
            rowKey={(e) => e.id}
            density="compact"
          />
        )}
      </section>
    </div>
  );
}
