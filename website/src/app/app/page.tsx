"use client";

import TopBar from "@/components/app/TopBar";
import StatCard from "@/components/app/dashboard/StatCard";
import ProjectsTable from "@/components/app/dashboard/ProjectsTable";
import { useDashboard } from "@/hooks/useDashboard";

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{title}</h2>
      {right}
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading, error, refresh } = useDashboard();

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (loading) {
    return (
      <div>
        <TopBar title="Home" />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-8 h-8 border-2 border-[#1E40AF] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <TopBar title="Home" />
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <p className="text-sm text-red-500">{error || "Failed to load dashboard"}</p>
          <button onClick={refresh} className="text-sm text-[#1E40AF] font-medium hover:underline">Try again</button>
        </div>
      </div>
    );
  }

  const agingBuckets = [
    { label: "Current", value: data.aging.current, color: "text-emerald-600" },
    { label: "1-30d", value: data.aging.days30, color: "text-yellow-600" },
    { label: "31-60d", value: data.aging.days60, color: "text-orange-500" },
    { label: "61-90d", value: data.aging.days90, color: "text-red-500" },
    { label: "90+d", value: data.aging.over90, color: "text-red-700" },
  ];

  return (
    <div>
      <TopBar title="Home" />
      <div className="px-4 md:px-0">
        {/* Date + refresh */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs text-gray-400">{dateStr}</p>
          <button onClick={refresh} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title="Refresh">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          </button>
        </div>

        {/* ─── FINANCIALS ─── */}
        <section className="mb-8">
          <SectionHeader title="Financials" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <StatCard label="Revenue" value={fmt$(data.revenue)} color="green" />
            <StatCard label="Expenses" value={fmt$(data.expenses)} color="red" />
            <StatCard label="Net Profit" value={fmt$(data.profit)} color={data.profit >= 0 ? "green" : "red"} />
            <StatCard label="Margin" value={`${data.margin.toFixed(1)}%`} color={data.margin >= 20 ? "green" : data.margin >= 10 ? "gray" : "red"} sub={data.margin >= 20 ? "Healthy" : data.margin >= 10 ? "Moderate" : "At Risk"} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="Contract Value" value={fmt$(data.totalContractValue)} color="blue" sub={`${data.totalProjects} projects`} />
            <StatCard label="Overhead" value={`${fmt$(data.monthlyOverhead)}/mo`} color="gray" sub={data.revenue > 0 ? `${((data.monthlyOverhead / data.revenue) * 100).toFixed(0)}% of revenue` : undefined} />
            <StatCard label="Payroll" value={fmt$(data.payrollGross)} color="gray" sub={`${data.payrollWorkerCount} paid this week`} />
          </div>
          {/* Cash Flow */}
          {data.cashFlowData.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 mt-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-3">Cash Flow (3 Months)</p>
              <div className="grid grid-cols-3 gap-4">
                {data.cashFlowData.map((m) => (
                  <div key={m.label} className="text-center">
                    <p className="text-[10px] text-gray-400 mb-2">{m.label}</p>
                    <p className="text-xs text-emerald-600 font-medium">+{fmt$(m.cashIn)}</p>
                    <p className="text-xs text-red-500 font-medium">-{fmt$(m.cashOut)}</p>
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <p className={`text-sm font-bold ${m.net >= 0 ? "text-emerald-600" : "text-red-500"}`}>{m.net >= 0 ? "+" : ""}{fmt$(m.net)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ─── PROJECTS ─── */}
        <section className="mb-8">
          <SectionHeader
            title="Projects"
            right={<span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{data.activeProjects} active / {data.totalProjects} total</span>}
          />
          <ProjectsTable projects={data.projectsList} />
        </section>

        {/* ─── BILLING ─── */}
        <section className="mb-8">
          <SectionHeader title="Billing" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Overdue */}
            <div className={`bg-white border rounded-xl p-5 ${data.overdueCount > 0 ? "border-red-200" : "border-gray-200"}`}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Overdue Invoices</p>
              {data.overdueCount > 0 ? (
                <>
                  <p className="text-2xl font-bold text-red-500">{data.overdueCount}</p>
                  <p className="text-sm text-red-400 mt-1">{fmt$(data.overdueAmount)} outstanding</p>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span className="text-sm font-medium text-emerald-600">All paid</span>
                </div>
              )}
            </div>

            {/* AR Aging */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Accounts Receivable</p>
              {data.aging.total > 0 ? (
                <>
                  <p className="text-2xl font-bold text-gray-900">{fmt$(data.aging.total)}</p>
                  <div className="flex gap-3 mt-2 flex-wrap">
                    {agingBuckets.map((b) => b.value > 0 && (
                      <span key={b.label} className="text-[11px]">
                        <span className={`font-semibold ${b.color}`}>{fmt$(b.value)}</span>
                        <span className="text-gray-400 ml-0.5">{b.label}</span>
                      </span>
                    ))}
                  </div>
                  {/* Stacked bar */}
                  <div className="flex h-1.5 rounded-full overflow-hidden mt-2 bg-gray-100">
                    {agingBuckets.map((b) => b.value > 0 && (
                      <div key={b.label} className={`h-full ${b.label === "Current" ? "bg-emerald-400" : b.label === "1-30d" ? "bg-yellow-400" : b.label === "31-60d" ? "bg-orange-400" : b.label === "61-90d" ? "bg-red-400" : "bg-red-600"}`} style={{ width: `${(b.value / data.aging.total) * 100}%` }} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span className="text-sm font-medium text-emerald-600">No outstanding receivables</span>
                </div>
              )}
            </div>
          </div>

          {/* Pipeline */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mt-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-3">Pipeline</p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] text-gray-400 mb-2">Estimates</p>
                <div className="flex gap-4">
                  <div><p className="text-lg font-bold text-gray-900">{data.estimates.draft}</p><p className="text-[10px] text-gray-400">Draft</p></div>
                  <div><p className="text-lg font-bold text-blue-600">{data.estimates.sent}</p><p className="text-[10px] text-gray-400">Sent</p></div>
                  <div><p className="text-lg font-bold text-emerald-600">{data.estimates.accepted}</p><p className="text-[10px] text-gray-400">Won</p></div>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-2">Invoices</p>
                <div className="flex gap-4">
                  <div><p className="text-lg font-bold text-red-500">{data.invoices.unpaid}</p><p className="text-[10px] text-gray-400">Unpaid</p></div>
                  <div><p className="text-lg font-bold text-amber-500">{data.invoices.partial}</p><p className="text-[10px] text-gray-400">Partial</p></div>
                  <div><p className="text-lg font-bold text-emerald-600">{data.invoices.paid}</p><p className="text-[10px] text-gray-400">Paid</p></div>
                </div>
              </div>
            </div>
          </div>

          {/* Unmatched Transactions */}
          {data.unmatchedCount > 0 && (
            <div className="bg-white border border-amber-200 rounded-xl p-5 mt-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Bank Reconciliation</p>
              <p className="text-sm text-amber-700">{data.unmatchedCount} unmatched transactions · {data.suggestedCount} suggested matches</p>
            </div>
          )}
        </section>

        {/* ─── TEAM ─── */}
        <section className="mb-8">
          <SectionHeader title="Team" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Workers</p>
              <p className="text-2xl font-bold text-gray-900">{data.totalWorkers}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Supervisors</p>
              <p className="text-2xl font-bold text-gray-900">{data.totalSupervisors}</p>
              {data.pendingInvites > 0 && (
                <p className="text-[11px] text-amber-600 mt-1">{data.pendingInvites} invite{data.pendingInvites > 1 ? "s" : ""} pending</p>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Active Projects</p>
              <p className="text-2xl font-bold text-[#1E40AF]">{data.activeProjects}</p>
              <p className="text-[11px] text-gray-400 mt-1">of {data.totalProjects} total</p>
            </div>
          </div>

          {/* Forgotten clock-outs */}
          {data.forgottenClockouts.length > 0 && (
            <div className="bg-white border border-amber-200 rounded-xl p-5 mt-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Forgotten Clock-outs</p>
              <p className="text-sm text-amber-700">{data.forgottenClockouts.length} team member{data.forgottenClockouts.length > 1 ? "s" : ""} clocked in 10+ hours</p>
              <p className="text-xs text-amber-600 mt-1">{data.forgottenClockouts.map(c => c.name).join(", ")}</p>
            </div>
          )}

          {/* Recent reports */}
          {data.recentReports.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 mt-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-3">Recent Reports</p>
              <div className="space-y-2">
                {data.recentReports.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{r.workerName} <span className="text-gray-400">—</span> {r.phaseName || r.projectName}</span>
                    {r.photoCount > 0 && <span className="text-[11px] text-gray-400">{r.photoCount} photo{r.photoCount > 1 ? "s" : ""}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ─── ALERTS ─── */}
        {data.alerts.length > 0 && (
          <section className="mb-8">
            <SectionHeader title="Alerts" />
            <div className="space-y-2">
              {data.alerts.map((a) => (
                <div key={a.key} className={`bg-white border rounded-xl p-4 flex items-center gap-3 ${a.color === "red" ? "border-red-200" : "border-amber-200"}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${a.color === "red" ? "bg-red-500" : "bg-amber-500"}`} />
                  <span className={`text-sm ${a.color === "red" ? "text-red-700" : "text-amber-700"}`}>{a.text}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="h-16" />
      </div>
    </div>
  );
}
