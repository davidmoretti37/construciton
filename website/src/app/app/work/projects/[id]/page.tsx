"use client";

import { useState, useEffect, useCallback, use } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { fetchProjectDetail, type ProjectDetail } from "@/services/projectDetail";

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{title}</h2>
      {right}
    </div>
  );
}

const statusColors: Record<string, string> = {
  active: "bg-blue-50 text-blue-700",
  "in_progress": "bg-blue-50 text-blue-700",
  "on-track": "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  behind: "bg-amber-50 text-amber-700",
  "over-budget": "bg-red-50 text-red-700",
  draft: "bg-gray-100 text-gray-500",
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true } }
    );
    const data = await fetchProjectDetail(supabase, id);
    setProject(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function togglePhase(phaseId: string) {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      next.has(phaseId) ? next.delete(phaseId) : next.add(phaseId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#1E40AF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="px-4 md:px-0 py-8">
        <Link href="/app/work" className="text-sm text-[#1E40AF] hover:underline">&larr; Back to Work</Link>
        <p className="text-gray-400 text-sm mt-8 text-center">Project not found</p>
      </div>
    );
  }

  const progress = project.contract_amount > 0 ? Math.min((project.income_collected / project.contract_amount) * 100, 100) : (project.actual_progress || 0);
  const statusClass = statusColors[project.status] || statusColors.active;

  return (
    <div className="px-4 md:px-0 py-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/work" className="p-2 -ml-2 text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{project.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusClass}`}>
              {project.status.replace(/[_-]/g, " ")}
            </span>
            {progress > 0 && <span className="text-xs text-gray-400">{progress.toFixed(0)}% complete</span>}
          </div>
        </div>
      </div>

      {/* ─── FINANCIALS ─── */}
      <section className="mb-8">
        <SectionHeader title="Financials" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Contract</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{fmt$(project.contract_amount)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Collected</p>
            <p className="text-lg font-bold text-emerald-600 mt-1">{fmt$(project.income_collected)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Expenses</p>
            <p className="text-lg font-bold text-red-500 mt-1">{fmt$(project.expenses)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Profit</p>
            <p className={`text-lg font-bold mt-1 ${project.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt$(project.profit)}</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>Collection Progress</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full">
            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      {/* ─── DETAILS ─── */}
      <section className="mb-8">
        <SectionHeader title="Details" />
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-gray-400 text-xs w-16 shrink-0 pt-0.5">Client</span>
            <span className="text-sm text-gray-900 font-medium">{project.client_name || "—"}</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-gray-400 text-xs w-16 shrink-0 pt-0.5">Phone</span>
            {project.client_phone ? (
              <a href={`tel:${project.client_phone}`} className="text-sm text-[#1E40AF] hover:underline">{project.client_phone}</a>
            ) : <span className="text-sm text-gray-300">—</span>}
          </div>
          <div className="flex items-start gap-3">
            <span className="text-gray-400 text-xs w-16 shrink-0 pt-0.5">Email</span>
            {project.client_email ? (
              <a href={`mailto:${project.client_email}`} className="text-sm text-[#1E40AF] hover:underline">{project.client_email}</a>
            ) : <span className="text-sm text-gray-300">—</span>}
          </div>
          <div className="flex items-start gap-3">
            <span className="text-gray-400 text-xs w-16 shrink-0 pt-0.5">Location</span>
            <span className="text-sm text-gray-700">{project.location || "—"}</span>
          </div>
          {project.task_description && (
            <div className="flex items-start gap-3">
              <span className="text-gray-400 text-xs w-16 shrink-0 pt-0.5">Scope</span>
              <span className="text-sm text-gray-700">{project.task_description}</span>
            </div>
          )}
        </div>
      </section>

      {/* ─── PHASES & TASKS ─── */}
      <section className="mb-8">
          <SectionHeader title="Phases" right={<span className="text-[11px] text-gray-400">{project.phases.length} phase{project.phases.length !== 1 ? "s" : ""}</span>} />
          <div className="space-y-2">
            {project.phases.map((phase) => {
              const isExpanded = expandedPhases.has(phase.id);
              const completedTasks = phase.tasks.filter((t) => t.status === "completed").length;
              const totalTasks = phase.tasks.length;
              const phasePct = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : (phase.completion_percentage || 0);

              return (
                <div key={phase.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <button onClick={() => togglePhase(phase.id)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{phase.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-24 h-1.5 bg-gray-100 rounded-full">
                          <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${phasePct}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400">{completedTasks}/{totalTasks} tasks</span>
                      </div>
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {isExpanded && phase.tasks.length > 0 && (
                    <div className="border-t border-gray-100 px-4 py-2">
                      {phase.tasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-3 py-2">
                          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${task.status === "completed" ? "bg-emerald-500 border-emerald-500" : "border-gray-300"}`}>
                            {task.status === "completed" && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </span>
                          <span className={`text-sm ${task.status === "completed" ? "text-gray-400 line-through" : "text-gray-700"}`}>{task.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {project.phases.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">No phases yet</div>
          )}
        </section>

      {/* ─── TEAM ─── */}
      <section className="mb-8">
        <SectionHeader title="Team" right={<span className="text-[11px] text-gray-400">{project.workers.length + (project.supervisor_name ? 1 : 0)} assigned</span>} />
        <div className="space-y-2">
          {project.supervisor_name && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-semibold text-white">{project.supervisor_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{project.supervisor_name}</p>
                <p className="text-[11px] text-violet-500">Supervisor</p>
              </div>
            </div>
          )}
          {project.workers.map((w) => (
            <div key={w.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] flex items-center justify-center shrink-0">
                <span className="text-[11px] font-semibold text-white">{w.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{w.full_name}</p>
                {w.trade && <p className="text-[11px] text-gray-400">{w.trade}</p>}
              </div>
            </div>
          ))}
          {!project.supervisor_name && project.workers.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">No one assigned yet</div>
          )}
        </div>
      </section>

      {/* ─── DAILY REPORTS ─── */}
      <section className="mb-8">
        <SectionHeader title="Daily Reports" right={project.reports.length > 0 ? <span className="text-[11px] text-gray-400">{project.reports.length} report{project.reports.length !== 1 ? "s" : ""}</span> : undefined} />
          <div className="space-y-2">
            {project.reports.map((r) => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.reporter_name}</p>
                  <p className="text-[11px] text-gray-400">{new Date(r.report_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
                <div className="flex items-center gap-2">
                  {r.photo_count > 0 && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{r.photo_count} photo{r.photo_count > 1 ? "s" : ""}</span>}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.reporter_type === "owner" ? "bg-blue-50 text-blue-600" : r.reporter_type === "supervisor" ? "bg-violet-50 text-violet-600" : "bg-emerald-50 text-emerald-600"}`}>{r.reporter_type}</span>
                </div>
              </div>
            ))}
          {project.reports.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">No reports yet</div>
          )}
          </div>
        </section>

      {/* ─── DOCUMENTS ─── */}
      <section className="mb-8">
        <SectionHeader title="Documents" right={project.documents.length > 0 ? <span className="text-[11px] text-gray-400">{project.documents.length}</span> : undefined} />
          <div className="space-y-2">
            {project.documents.map((d) => (
              <div key={d.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${d.file_type === "pdf" ? "bg-red-50" : "bg-blue-50"}`}>
                  <span className="text-[10px] font-bold uppercase ${d.file_type === 'pdf' ? 'text-red-500' : 'text-blue-500'}">{d.file_type === "pdf" ? "PDF" : "IMG"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{d.file_name}</p>
                  <p className="text-[11px] text-gray-400">{new Date(d.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          {project.documents.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">No documents yet</div>
          )}
          </div>
        </section>

      {/* ─── ESTIMATES ─── */}
      <section className="mb-8">
        <SectionHeader title="Estimates" right={project.estimates.length > 0 ? <span className="text-[11px] text-gray-400">{project.estimates.length}</span> : undefined} />
          <div className="space-y-2">
            {project.estimates.map((e) => (
              <div key={e.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{e.estimate_number || `Estimate`}</p>
                  <p className="text-[11px] text-gray-400">{new Date(e.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{fmt$(e.total)}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${e.status === "accepted" ? "bg-emerald-50 text-emerald-600" : e.status === "sent" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"}`}>{e.status}</span>
                </div>
              </div>
            ))}
          {project.estimates.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">No estimates yet</div>
          )}
          </div>
        </section>

      {/* ─── TIMELINE ─── */}
      <section className="mb-8">
        <SectionHeader title="Timeline" />
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="grid grid-cols-3 gap-4">
              {project.start_date && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase">Start</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{new Date(project.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
              )}
              {project.end_date && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase">End</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{new Date(project.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
              )}
              {project.days_remaining !== undefined && project.days_remaining > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase">Remaining</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{project.days_remaining} days</p>
                </div>
              )}
            </div>
          {!project.start_date && !project.end_date && (
            <p className="text-sm text-gray-400">No dates set</p>
          )}
          </div>
        </section>

      <div className="h-16" />
    </div>
  );
}
