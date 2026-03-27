"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import TopBar from "@/components/app/TopBar";
import { fetchProjects, fetchServicePlans, type Project, type ServicePlan } from "@/services/projects";

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// ─── Toggle ───
function SegmentToggle({
  active,
  onChange,
  showFilter,
  onToggleFilter,
  isFilterActive,
}: {
  active: "projects" | "services";
  onChange: (v: "projects" | "services") => void;
  showFilter: boolean;
  onToggleFilter: () => void;
  isFilterActive: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {/* Filter button */}
      <button
        onClick={onToggleFilter}
        className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
          showFilter || isFilterActive ? "bg-[#1E40AF]/10" : "bg-gray-100 hover:bg-gray-200"
        }`}
      >
        <svg
          className={`w-4.5 h-4.5 transition-colors ${isFilterActive ? "text-[#1E40AF]" : "text-gray-400"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
        </svg>
      </button>

      {/* Toggle */}
      <div className="flex flex-1 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => onChange("projects")}
          style={{ flex: active === "projects" ? 0.63 : 0.37 }}
          className={`py-2.5 rounded-lg font-bold transition-all duration-300 ease-out ${
            active === "projects"
              ? "bg-white text-[#1E40AF] shadow-sm text-[17px]"
              : "text-gray-400/55 text-[13px]"
          }`}
        >
          Projects
        </button>
        <button
          onClick={() => onChange("services")}
          style={{ flex: active === "services" ? 0.63 : 0.37 }}
          className={`py-2.5 rounded-lg font-bold transition-all duration-300 ease-out ${
            active === "services"
              ? "bg-white text-[#1E40AF] shadow-sm text-[17px]"
              : "text-gray-400/55 text-[13px]"
          }`}
        >
          Services
        </button>
      </div>
    </div>
  );
}

// ─── Filter Pills ───
function FilterPills({ filters, active, onChange, visible }: { filters: { key: string; label: string; count: number }[]; active: string; onChange: (k: string) => void; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="flex gap-2 mb-4 overflow-x-auto animate-fade-in-up [animation-duration:200ms]">
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            active === f.key
              ? "bg-[#1E40AF] text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {f.label}
          <span className={`ml-1 ${active === f.key ? "text-white/70" : "text-gray-400"}`}>
            {f.count}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Status Badge ───
const statusColors: Record<string, string> = {
  active: "bg-blue-50 text-blue-700",
  "in_progress": "bg-blue-50 text-blue-700",
  "on-track": "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  behind: "bg-amber-50 text-amber-700",
  "over-budget": "bg-red-50 text-red-700",
  draft: "bg-gray-100 text-gray-500",
  archived: "bg-gray-100 text-gray-500",
  paused: "bg-amber-50 text-amber-700",
};

// ─── Project Card (2-col grid) ───
function ProjectCard({ project }: { project: Project }) {
  const progress = project.contract_amount > 0
    ? Math.min((project.income_collected / project.contract_amount) * 100, 100)
    : 0;
  const status = project.status || "active";
  const statusClass = statusColors[status] || statusColors.active;

  return (
    <Link href={`/app/work/projects/${project.id}`} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors cursor-pointer block">
      <div className="flex items-start justify-between mb-2">
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusClass}`}>
          {status.replace(/[_-]/g, " ")}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-1">{project.name}</h3>
      {project.client_name && (
        <p className="text-xs text-gray-400 truncate mb-3">{project.client_name}</p>
      )}
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-gray-400">Budget</span>
        <span className="font-medium text-gray-700">{fmt$(project.contract_amount || 0)}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full">
        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-[10px] text-gray-400 mt-1">{fmt$(project.income_collected || 0)} collected</p>
    </Link>
  );
}

// ─── Service Plan Card ───
const serviceTypeColors: Record<string, { bg: string; text: string }> = {
  "pest_control": { bg: "bg-red-50", text: "text-red-600" },
  "cleaning": { bg: "bg-violet-50", text: "text-violet-600" },
  "landscaping": { bg: "bg-emerald-50", text: "text-emerald-600" },
  "pool_service": { bg: "bg-blue-50", text: "text-blue-600" },
  "lawn_care": { bg: "bg-green-50", text: "text-green-600" },
  "hvac": { bg: "bg-amber-50", text: "text-amber-600" },
  "other": { bg: "bg-gray-50", text: "text-gray-600" },
};

function ServicePlanCard({ plan }: { plan: ServicePlan }) {
  const typeColor = serviceTypeColors[plan.service_type] || serviceTypeColors.other;
  const progress = plan.visits_this_month > 0 ? (plan.completed_this_month / plan.visits_this_month) * 100 : 0;
  const price = plan.billing_cycle === "monthly" ? plan.monthly_price : plan.price_per_visit;
  const priceLabel = plan.billing_cycle === "monthly" ? "/mo" : "/visit";
  const isPaused = plan.status === "paused";

  return (
    <Link href={`/app/work/services/${plan.id}`} className={`bg-white border rounded-xl p-4 hover:border-gray-300 transition-colors cursor-pointer block ${isPaused ? "border-amber-300 opacity-80" : "border-gray-200"}`}>
      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mb-2 ${typeColor.bg} ${typeColor.text}`}>
        {plan.service_type.replace(/[_-]/g, " ")}
      </span>
      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-1">{plan.name}</h3>
      <p className="text-xs text-gray-400 mb-3">{plan.locations_count} location{plan.locations_count !== 1 ? "s" : ""}</p>

      {plan.visits_this_month > 0 && (
        <>
          <p className="text-[10px] text-gray-400 mb-1">{plan.completed_this_month}/{plan.visits_this_month} visits</p>
          <div className="w-full h-1 bg-gray-100 rounded-full mb-2">
            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${progress}%` }} />
          </div>
        </>
      )}

      <p className="text-sm font-bold text-[#1E40AF]">{fmt$(price || 0)}{priceLabel}</p>
      {isPaused && (
        <p className="text-[10px] text-amber-600 font-medium mt-1">Paused</p>
      )}
    </Link>
  );
}

// ─── Main Page ───
export default function WorkPage() {
  const [tab, setTab] = useState<"projects" | "services">("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [showFilter, setShowFilter] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: true, autoRefreshToken: true } }
      );
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const [proj, plans] = await Promise.all([
        fetchProjects(supabase, session.user.id),
        fetchServicePlans(supabase, session.user.id),
      ]);
      setProjects(proj);
      setServicePlans(plans);
    } catch (e) {
      console.error("[Work]", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter projects
  const activeStatuses = ["active", "in_progress", "on-track", "behind", "over-budget"];
  const filteredProjects = projects.filter((p) => {
    switch (projectFilter) {
      case "active": return activeStatuses.includes(p.status);
      case "mine": return p.assignment_status === "owner_direct" || !p.assigned_supervisor_id;
      case "assigned": return !!p.assigned_supervisor_id;
      case "done": return p.status === "completed";
      case "draft": return p.status === "draft";
      default: return true;
    }
  });

  const projectFilters = [
    { key: "all", label: "All", count: projects.length },
    { key: "active", label: "Active", count: projects.filter((p) => activeStatuses.includes(p.status)).length },
    { key: "mine", label: "Mine", count: projects.filter((p) => !p.assigned_supervisor_id).length },
    { key: "assigned", label: "Assigned", count: projects.filter((p) => !!p.assigned_supervisor_id).length },
    { key: "done", label: "Done", count: projects.filter((p) => p.status === "completed").length },
    { key: "draft", label: "Draft", count: projects.filter((p) => p.status === "draft").length },
  ];

  // Filter services
  const filteredServices = servicePlans.filter((p) => {
    switch (serviceFilter) {
      case "active": return p.status === "active";
      case "paused": return p.status === "paused";
      default: return true;
    }
  });

  const serviceFilters = [
    { key: "all", label: "All", count: servicePlans.length },
    { key: "active", label: "Active", count: servicePlans.filter((p) => p.status === "active").length },
    { key: "paused", label: "Paused", count: servicePlans.filter((p) => p.status === "paused").length },
  ];

  return (
    <div>
      <TopBar title="Work" />
      <div className="px-4 md:px-0">
        <SegmentToggle
          active={tab}
          onChange={setTab}
          showFilter={showFilter}
          onToggleFilter={() => setShowFilter((v) => !v)}
          isFilterActive={tab === "projects" ? projectFilter !== "all" : serviceFilter !== "all"}
        />

        {loading ? (
          <div className="flex items-center justify-center h-[40vh]">
            <div className="w-8 h-8 border-2 border-[#1E40AF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === "projects" ? (
          <>
            <FilterPills filters={projectFilters} active={projectFilter} onChange={setProjectFilter} visible={showFilter} />
            {filteredProjects.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                <p className="text-gray-400 text-sm">No projects found</p>
              </div>
            ) : projectFilter === "assigned" ? (
              // Grouped by supervisor
              <div className="space-y-6">
                {Object.entries(
                  filteredProjects.reduce<Record<string, Project[]>>((groups, p) => {
                    const name = p.managed_by_name || "Unassigned";
                    if (!groups[name]) groups[name] = [];
                    groups[name].push(p);
                    return groups;
                  }, {})
                )
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([supervisorName, supervisorProjects]) => (
                    <div key={supervisorName}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] flex items-center justify-center shrink-0">
                          <span className="text-[11px] font-semibold text-white">
                            {supervisorName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{supervisorName}&apos;s Projects</p>
                          <p className="text-[11px] text-gray-400">{supervisorProjects.length} project{supervisorProjects.length !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {supervisorProjects.map((p) => (
                          <ProjectCard key={p.id} project={p} />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredProjects.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <FilterPills filters={serviceFilters} active={serviceFilter} onChange={setServiceFilter} visible={showFilter} />
            {filteredServices.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                <p className="text-gray-400 text-sm">No service plans yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredServices.map((p) => (
                  <ServicePlanCard key={p.id} plan={p} />
                ))}
              </div>
            )}
          </>
        )}

        <div className="h-16" />
      </div>
    </div>
  );
}
