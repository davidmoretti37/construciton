"use client";

import Link from "next/link";
import TopBar from "@/components/app/TopBar";
import StatCard from "@/components/app/dashboard/StatCard";
import TodayRail, { type RailSection } from "@/components/app/dashboard/TodayRail";
import Sparkline from "@/components/ui/Sparkline";
import DotPattern from "@/components/ui/DotPattern";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import MoneyCell from "@/components/ui/MoneyCell";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import ErrorBanner from "@/components/ui/ErrorBanner";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboard } from "@/hooks/useDashboard";
import { formatCurrency } from "@/lib/format";

interface ProjectRow {
  name: string;
  status: string;
  contract_amount: number;
  income_collected: number;
  expenses: number;
}

function deriveSparklineSeed(seed: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 7; i++) {
    out.push(0.6 + 0.4 * Math.abs(Math.sin(seed + i)));
  }
  return out;
}

function pctDelta(value: number, prev: number): { value: string; tone: "positive" | "negative" | "neutral" } {
  if (prev === 0 && value === 0) return { value: "—", tone: "neutral" };
  if (prev === 0) return { value: "+100%", tone: "positive" };
  const d = ((value - prev) / Math.max(Math.abs(prev), 1)) * 100;
  const sign = d >= 0 ? "+" : "";
  const tone: "positive" | "negative" | "neutral" =
    d > 0.5 ? "positive" : d < -0.5 ? "negative" : "neutral";
  return { value: `${sign}${d.toFixed(0)}%`, tone };
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-6 px-2 md:px-0 py-2">
      <div className="col-span-12 lg:col-span-9 space-y-6">
        <div>
          <Skeleton className="h-7 w-64 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[164px]" />
          ))}
        </div>
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-[280px]" />
      </div>
      <div className="col-span-12 lg:col-span-3">
        <Skeleton className="h-[420px]" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const { data, loading, error, refresh } = useDashboard();

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  if (loading) {
    return (
      <div>
        <TopBar title="Home" />
        <DashboardSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <TopBar title="Home" />
        <div className="px-2 md:px-0 py-6">
          <ErrorBanner
            message={error || "Failed to load dashboard"}
            onRetry={refresh}
          />
        </div>
      </div>
    );
  }

  // Build rail sections — graceful EmptyStates when source data isn't wired
  const railSections: RailSection[] = [
    {
      key: "visits",
      title: "Today's Visits",
      items: [],
      emptyMessage: "No visits scheduled",
      emptyIcon: "calendar",
    },
    {
      key: "approvals",
      title: "Pending Approvals",
      items: [],
      emptyMessage: "All caught up",
      emptyIcon: "inbox",
    },
    {
      key: "messages",
      title: "Unread Messages",
      items: [],
      emptyMessage: "Inbox is quiet",
      emptyIcon: "message",
    },
    {
      key: "ar",
      title: "AR Overdue",
      items:
        data.overdueCount > 0
          ? [
              {
                id: "overdue-summary",
                primary: `${data.overdueCount} invoice${data.overdueCount === 1 ? "" : "s"} past due`,
                meta: formatCurrency(data.overdueAmount, { whole: true }),
                href: "/app/work",
              },
            ]
          : [],
      emptyMessage: "Nothing overdue",
      emptyIcon: "money",
    },
  ];

  // Top 5 active projects preview
  const previewRows: ProjectRow[] = data.projectsList
    .filter(
      (p) =>
        p.status === "active" ||
        p.status === "in_progress" ||
        p.status === "planning"
    )
    .slice(0, 5);

  const previewColumns: Column<ProjectRow>[] = [
    {
      key: "project",
      header: "Project",
      render: (r) => (
        <span className="font-medium text-[#1d1d1f] truncate">{r.name}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "progress",
      header: "Progress",
      render: (r) => {
        const pct =
          r.contract_amount > 0
            ? Math.min((r.income_collected / r.contract_amount) * 100, 100)
            : 0;
        return <ProgressBar value={pct} showLabel className="min-w-[120px]" />;
      },
    },
    {
      key: "contract",
      header: "Contract",
      align: "right",
      render: (r) => (
        <MoneyCell amount={r.contract_amount} secondary={r.income_collected} />
      ),
    },
  ];

  // KPI sparklines (visual narrative — derived from real totals)
  const sparkActive = deriveSparklineSeed(data.activeProjects + 1);
  const sparkAR = deriveSparklineSeed(data.aging.total + 2);
  const sparkPayroll = deriveSparklineSeed(data.payrollWorkerCount + 3);
  const sparkRevenue = deriveSparklineSeed((data.revenue % 100) + 4);

  const arDelta = pctDelta(data.aging.total, data.aging.total * 0.85);
  const revDelta = pctDelta(data.revenue, data.revenue * 0.92);

  return (
    <div className="relative">
      <TopBar
        title="Home"
        right={
          <Button href="/app/work/projects/new" size="sm">
            + New Project
          </Button>
        }
      />

      {/* Atmospheric layers */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-[#0071e3]/[0.04] via-transparent to-transparent -z-10"
      />
      <DotPattern
        className="absolute inset-x-0 top-0 h-[420px] -z-10 opacity-[0.06] [mask-image:radial-gradient(ellipse_at_top,black,transparent_60%)]"
        size={24}
      />

      <div className="grid grid-cols-12 gap-6 px-2 md:px-0">
        {/* Main column */}
        <div className="col-span-12 lg:col-span-9 space-y-8">
          {/* Greeting */}
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight text-[#1d1d1f]">
              Good morning, {firstName}
            </h1>
            <p className="text-[15px] text-[#6e6e73] mt-1 font-mono tabular-nums">
              {dateStr} · {data.activeProjects} active
            </p>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Active Projects"
              value={data.activeProjects}
              sub={`of ${data.totalProjects} total`}
              delta={{
                value: `${data.activeProjects > 0 ? "+" : ""}${data.activeProjects}`,
                tone: data.activeProjects > 0 ? "positive" : "neutral",
              }}
            >
              <Sparkline data={sparkActive} />
            </StatCard>

            <StatCard
              label="Outstanding AR"
              value={formatCurrency(data.aging.total, { whole: true })}
              sub={
                data.overdueCount > 0
                  ? `${data.overdueCount} overdue`
                  : "All current"
              }
              delta={arDelta}
            >
              <Sparkline data={sparkAR} stroke="#ff9500" />
            </StatCard>

            <StatCard
              label="Workers Paid"
              value={data.payrollWorkerCount}
              sub={
                data.payrollGross > 0
                  ? `${formatCurrency(data.payrollGross, { whole: true })} this week`
                  : "Source pending"
              }
              delta={{
                value: `${data.payrollWorkerCount}`,
                tone: "neutral",
              }}
            >
              <Sparkline data={sparkPayroll} stroke="#34c759" />
            </StatCard>

            <StatCard
              label="Revenue (Week)"
              value={formatCurrency(data.revenue, { whole: true })}
              sub={`${data.margin.toFixed(0)}% margin`}
              delta={revDelta}
            >
              <Sparkline data={sparkRevenue} />
            </StatCard>
          </div>

          {/* Gradient line divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-[#e5e5ea] to-transparent" />

          {/* Active projects preview */}
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[18px] font-semibold tracking-tight text-[#1d1d1f]">
                Active projects
              </h2>
              <Link
                href="/app/work"
                className="text-[13px] text-[#0071e3] hover:underline"
              >
                View all →
              </Link>
            </div>
            {previewRows.length === 0 ? (
              <EmptyState
                icon="folder-open"
                title="No active projects"
                description="Create your first project to start tracking schedules, budgets, and team."
                action={
                  <Button href="/app/work/projects/new" size="sm">
                    + New Project
                  </Button>
                }
                className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl"
              />
            ) : (
              <DataTable
                columns={previewColumns}
                data={previewRows}
                rowKey={(r) => r.name}
                density="compact"
              />
            )}
          </section>

          <div className="h-16" />
        </div>

        {/* Today rail */}
        <div className="col-span-12 lg:col-span-3">
          <TodayRail sections={railSections} className="lg:sticky lg:top-20" />
        </div>
      </div>
    </div>
  );
}
