"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import ProgressBar from "@/components/ui/ProgressBar";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import type { ProjectDetail, Phase } from "@/services/projectDetail";

interface Props {
  project: ProjectDetail;
}

export default function ProjectSchedule({ project }: Props) {
  const [activePhaseId, setActivePhaseId] = useState<string | null>(
    project.phases[0]?.id ?? null
  );

  if (project.phases.length === 0) {
    return (
      <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl">
        <EmptyState
          icon="calendar"
          title="No schedule yet"
          description="Add phases to plan your project timeline."
        />
      </div>
    );
  }

  const active: Phase | undefined = project.phases.find((p) => p.id === activePhaseId);

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-12 lg:col-span-4 lg:sticky lg:top-32 lg:self-start">
        <ul className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl divide-y divide-[#e5e5ea] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
          {project.phases.map((phase) => {
            const isActive = phase.id === activePhaseId;
            return (
              <li key={phase.id}>
                <button
                  type="button"
                  onClick={() => setActivePhaseId(phase.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors",
                    isActive ? "bg-[#0071e3]/[0.06]" : "hover:bg-[#fbfbfd]"
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[12px] tabular-nums w-6",
                      isActive ? "text-[#0071e3]" : "text-[#86868b]"
                    )}
                  >
                    {String(phase.order_index + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[13px] font-medium truncate", isActive ? "text-[#0071e3]" : "text-[#1d1d1f]")}>
                      {phase.name}
                    </p>
                    <ProgressBar value={phase.completion_percentage} className="mt-1.5" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="col-span-12 lg:col-span-8">
        {active && (
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)] p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h3 className="text-[18px] font-semibold tracking-tight text-[#1d1d1f]">
                  {active.name}
                </h3>
                <p className="text-[12px] text-[#86868b] font-mono mt-0.5">
                  {active.planned_days ?? "—"} days planned · {active.tasks.length} tasks
                </p>
              </div>
              <StatusBadge status={active.status} />
            </div>

            {active.tasks.length === 0 ? (
              <EmptyState
                icon="bolt"
                title="No tasks for this phase"
                variant="compact"
              />
            ) : (
              <ul className="space-y-1">
                {active.tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center gap-3 py-2 px-3 rounded-[10px] hover:bg-[#fbfbfd]"
                  >
                    <span
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                        task.status === "completed"
                          ? "bg-[#34c759] border-[#34c759]"
                          : "border-[#d2d2d7]"
                      )}
                    >
                      {task.status === "completed" && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-[14px]",
                        task.status === "completed"
                          ? "text-[#86868b] line-through"
                          : "text-[#1d1d1f]"
                      )}
                    >
                      {task.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
