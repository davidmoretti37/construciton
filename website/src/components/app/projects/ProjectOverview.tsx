"use client";

import StatCard from "@/components/app/dashboard/StatCard";
import ProgressBar from "@/components/ui/ProgressBar";
import EmptyState from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/format";
import type { ProjectDetail } from "@/services/projectDetail";

interface Props {
  project: ProjectDetail;
}

export default function ProjectOverview({ project }: Props) {
  const budgetUsed =
    project.contract_amount > 0
      ? Math.min((project.expenses / project.contract_amount) * 100, 100)
      : 0;

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-8 space-y-6">
        <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)] p-6">
          <h3 className="text-[16px] font-semibold tracking-tight text-[#1d1d1f] mb-4">
            Milestones
          </h3>
          {project.phases.length === 0 ? (
            <EmptyState
              icon="bolt"
              title="No phases yet"
              message="Add phases in the Schedule tab"
              variant="compact"
            />
          ) : (
            <ul className="space-y-4">
              {project.phases.slice(0, 6).map((phase) => (
                <li key={phase.id} className="flex items-center gap-4">
                  <span className="font-mono text-[12px] text-[#86868b] tabular-nums w-6">
                    {String(phase.order_index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-[14px] text-[#1d1d1f]">
                    {phase.name}
                  </span>
                  <ProgressBar
                    value={phase.completion_percentage}
                    showLabel
                    className="w-40"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {project.task_description && (
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)] p-6">
            <h3 className="text-[16px] font-semibold tracking-tight text-[#1d1d1f] mb-2">
              Scope
            </h3>
            <p className="text-[14px] leading-relaxed text-[#525252]">
              {project.task_description}
            </p>
          </div>
        )}
      </div>

      <div className="col-span-12 lg:col-span-4 space-y-4">
        <StatCard
          label="Budget Used"
          value={`${budgetUsed.toFixed(0)}%`}
          sub={`${formatCurrency(project.expenses, { whole: true })} spent`}
        />
        <StatCard
          label="Days Remaining"
          value={project.days_remaining ?? "—"}
          sub={project.end_date ? `Due ${new Date(project.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "No end date"}
        />
        <StatCard
          label="Team"
          value={project.workers.length + (project.supervisor_name ? 1 : 0)}
          sub="people assigned"
        />
        <StatCard
          label="Documents"
          value={project.documents.length}
          sub="files uploaded"
        />
      </div>
    </div>
  );
}
