"use client";

import { cn } from "@/lib/cn";
import EmptyState from "@/components/ui/EmptyState";
import type { ProjectDetail } from "@/services/projectDetail";

interface Props {
  project: ProjectDetail;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function ProjectTeam({ project }: Props) {
  const team: { id: string; name: string; trade: string; lead: boolean }[] = [];
  if (project.supervisor_name) {
    team.push({
      id: "lead",
      name: project.supervisor_name,
      trade: "Supervisor",
      lead: true,
    });
  }
  for (const w of project.workers) {
    team.push({
      id: w.id,
      name: w.full_name,
      trade: w.trade ?? "Crew",
      lead: false,
    });
  }

  if (team.length === 0) {
    return (
      <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl">
        <EmptyState
          icon="users"
          title="No team yet"
          description="Assign a supervisor and crew to this project to track who's on site."
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {team.map((m) => (
        <div
          key={m.id}
          className={cn(
            "bg-white ring-1 ring-[#e5e5ea] rounded-2xl p-5",
            "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]",
            "flex items-center gap-4 transition-shadow hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_4px_8px_rgba(0,0,0,0.06)]",
            m.lead && "sm:col-span-2"
          )}
        >
          <div
            className={cn(
              "rounded-full flex items-center justify-center shrink-0",
              m.lead
                ? "w-14 h-14 bg-gradient-to-br from-[#0071e3] to-[#005bb5] text-white"
                : "w-11 h-11 bg-[#f5f5f7] text-[#1d1d1f]"
            )}
          >
            <span className={cn("font-semibold", m.lead ? "text-[14px]" : "text-[12px]")}>
              {initials(m.name)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-[#1d1d1f] truncate">
              {m.name}
            </p>
            <p className="text-[12px] text-[#6e6e73]">{m.trade}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-[#34c759] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34c759]" />
            On site
          </span>
        </div>
      ))}
    </div>
  );
}
