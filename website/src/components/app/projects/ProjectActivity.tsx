"use client";

import { cn } from "@/lib/cn";
import EmptyState from "@/components/ui/EmptyState";
import type { ProjectDetail } from "@/services/projectDetail";

interface Props {
  project: ProjectDetail;
}

interface Event {
  id: string;
  iconColor: string;
  actor: string;
  verb: string;
  object: string;
  timestamp: string;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ProjectActivity({ project }: Props) {
  const events: Event[] = [];

  for (const r of project.reports) {
    events.push({
      id: `report-${r.id}`,
      iconColor: "#0071e3",
      actor: r.reporter_name,
      verb: "filed daily report",
      object: r.photo_count > 0 ? `with ${r.photo_count} photos` : "",
      timestamp: r.report_date,
    });
  }
  for (const e of project.estimates) {
    events.push({
      id: `est-${e.id}`,
      iconColor: e.status === "accepted" ? "#34c759" : "#0071e3",
      actor: "System",
      verb: `created estimate ${e.estimate_number ?? ""}`.trim(),
      object: `(${e.status})`,
      timestamp: e.created_at,
    });
  }

  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (events.length === 0) {
    return (
      <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl">
        <EmptyState
          icon="bolt"
          title="No activity yet"
          description="Reports, estimates, and approvals will appear here as they happen."
        />
      </div>
    );
  }

  return (
    <ol className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)] p-6 space-y-4">
      {events.map((e, i) => (
        <li key={e.id} className="flex items-start gap-3">
          <span className="relative shrink-0 mt-1">
            <span
              className={cn("block w-2 h-2 rounded-full")}
              style={{ background: e.iconColor }}
            />
            {i < events.length - 1 && (
              <span className="absolute left-1/2 top-3 -translate-x-1/2 w-px h-12 bg-[#e5e5ea]" />
            )}
          </span>
          <div className="flex-1 pb-4">
            <p className="text-[13px] text-[#1d1d1f]">
              <span className="font-medium">{e.actor}</span>{" "}
              <span className="text-[#525252]">{e.verb}</span>{" "}
              {e.object && <span className="text-[#86868b]">{e.object}</span>}
            </p>
            <p className="text-[11px] text-[#86868b] font-mono mt-0.5">
              {timeAgo(e.timestamp)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
