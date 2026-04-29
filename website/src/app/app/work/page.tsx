"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import TopBar from "@/components/app/TopBar";
import Button from "@/components/ui/Button";
import DotPattern from "@/components/ui/DotPattern";
import FilterBar, { type FilterChip } from "@/components/ui/FilterBar";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import MoneyCell from "@/components/ui/MoneyCell";
import RowActions from "@/components/ui/RowActions";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import ErrorBanner from "@/components/ui/ErrorBanner";
import { fetchProjects, type Project } from "@/services/projects";
import type { DensityMode } from "@/types";

function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
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

const ACTIVE_STATUSES = new Set([
  "active",
  "in_progress",
  "in-progress",
  "planning",
]);

export default function WorkPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [density, setDensity] = useState<DensityMode>("comfortable");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: true, autoRefreshToken: true } }
      );
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setError("Please sign in");
        setProjects([]);
        return;
      }
      const rows = await fetchProjects(supabase, session.user.id);
      setProjects(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const totals = {
      all: projects.length,
      in_progress: 0,
      on_hold: 0,
      behind: 0,
    };
    for (const p of projects) {
      if (ACTIVE_STATUSES.has(p.status)) totals.in_progress++;
      if (p.status === "on_hold" || p.status === "on-hold" || p.status === "paused") totals.on_hold++;
      if (p.status === "behind" || p.status === "over-budget") totals.behind++;
    }
    return totals;
  }, [projects]);

  const chips: FilterChip[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "in_progress", label: "In progress", count: counts.in_progress },
    { key: "on_hold", label: "On hold", count: counts.on_hold },
    { key: "behind", label: "Behind", count: counts.behind },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter === "in_progress" && !ACTIVE_STATUSES.has(p.status)) return false;
      if (
        filter === "on_hold" &&
        !(p.status === "on_hold" || p.status === "on-hold" || p.status === "paused")
      )
        return false;
      if (
        filter === "behind" &&
        !(p.status === "behind" || p.status === "over-budget")
      )
        return false;
      if (!q) return true;
      const hay = `${p.name} ${p.client_name ?? ""} ${p.location ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [projects, filter, search]);

  const columns: Column<Project>[] = [
    {
      key: "project",
      header: "Project",
      render: (p) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-10 h-10 shrink-0 rounded-[8px] ring-1 ring-[#e5e5ea] overflow-hidden bg-[#f5f5f7]">
            <Image
              src="/logo.png"
              alt=""
              fill
              sizes="40px"
              className="object-cover opacity-70"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[#1d1d1f] truncate">{p.name}</p>
            {p.location && (
              <p className="text-[12px] text-[#86868b] truncate">{p.location}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "client",
      header: "Client",
      render: (p) => (
        <span className="text-[13px] text-[#1d1d1f] truncate">
          {p.client_name || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: "progress",
      header: "Progress",
      render: (p) => {
        const pct =
          p.contract_amount > 0
            ? Math.min((p.income_collected / p.contract_amount) * 100, 100)
            : p.actual_progress || 0;
        return <ProgressBar value={pct} showLabel className="min-w-[140px]" />;
      },
    },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      render: (p) => (
        <MoneyCell
          amount={p.contract_amount || 0}
          secondary={p.income_collected || 0}
        />
      ),
    },
    {
      key: "updated",
      header: "Updated",
      align: "right",
      render: (p) => (
        <span
          className="text-[12px] text-[#86868b] font-mono tabular-nums"
          title={p.created_at}
        >
          {timeAgo(p.created_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "60px",
      align: "right",
      render: (p) => (
        <RowActions
          items={[
            { label: "Open", href: `/app/work/projects/${p.id}` },
            { label: "Edit", href: `/app/work/projects/${p.id}/edit` },
            { separator: true },
            { label: "Archive", danger: true, disabled: true },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="relative">
      <TopBar
        title="Work"
        right={
          <Button href="/app/work/projects/new" size="sm">
            + New Project
          </Button>
        }
      />

      <DotPattern
        className="absolute inset-x-0 top-0 h-[200px] -z-10 opacity-[0.05]"
        size={24}
      />

      <div className="px-2 md:px-0 space-y-5">
        {/* Header */}
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[24px] font-semibold tracking-tight text-[#1d1d1f]">
              Projects
            </h1>
            <span className="text-[14px] text-[#6e6e73] font-mono tabular-nums">
              {projects.length} total
            </span>
          </div>
          <Button href="/app/work/projects/new" size="sm">
            + New Project
          </Button>
        </div>

        {/* Filter bar */}
        <FilterBar
          chips={chips}
          active={filter}
          onChange={setFilter}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search projects, clients, locations…"
          density={density}
          onDensityChange={setDensity}
        />

        {/* Table */}
        {error ? (
          <ErrorBanner message={error} onRetry={load} />
        ) : loading ? (
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl p-2 space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : filtered.length === 0 && projects.length === 0 ? (
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl">
            <EmptyState
              icon="folder-open"
              title="No projects yet"
              description="Create your first project to start tracking schedules, budgets, and team."
              action={
                <Button href="/app/work/projects/new" size="sm">
                  + New Project
                </Button>
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl">
            <EmptyState
              icon="search"
              title="No projects match this filter"
              action={
                <button
                  type="button"
                  onClick={() => {
                    setFilter("all");
                    setSearch("");
                  }}
                  className="text-[13px] text-[#0071e3] hover:underline"
                >
                  Clear filters
                </button>
              }
            />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            rowKey={(p) => p.id}
            density={density}
            onRowClick={(p) => router.push(`/app/work/projects/${p.id}`)}
            stickyHeader
          />
        )}

        <div className="h-16" />
      </div>
    </div>
  );
}
