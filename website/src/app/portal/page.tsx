"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PortalShell from "@/components/portal/PortalShell";
import { fetchDashboard, type PortalDashboard } from "@/services/portal";

function statusColor(status: string) {
  switch (status) {
    case "active":
    case "on-track":
      return "bg-green-100 text-green-700";
    case "behind":
    case "over-budget":
      return "bg-amber-100 text-amber-700";
    case "completed":
      return "bg-blue-100 text-blue-700";
    case "draft":
      return "bg-gray-100 text-gray-500";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);
}

export default function PortalDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<PortalDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PortalShell>
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Outstanding invoices banner */}
          {data.outstandingInvoices.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    {data.outstandingInvoices.length} outstanding invoice{data.outstandingInvoices.length !== 1 ? "s" : ""}
                  </p>
                  <p className="text-lg font-bold text-amber-900 mt-0.5">
                    {formatCurrency(data.outstandingInvoices.reduce((sum, inv) => sum + (inv.amount_due || 0), 0))} due
                  </p>
                </div>
                <Link
                  href="/portal/invoices"
                  className="text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  View All
                </Link>
              </div>
            </div>
          )}

          {/* Pending estimates */}
          {data.pendingEstimates.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm font-medium text-blue-800 mb-3">
                {data.pendingEstimates.length} estimate{data.pendingEstimates.length !== 1 ? "s" : ""} awaiting your response
              </p>
              <div className="space-y-2">
                {data.pendingEstimates.map((est) => (
                  <div
                    key={est.id}
                    className="bg-white rounded-lg p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      // Navigate to the project that has this estimate
                      // For now, show in a flat list
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{est.project_name || est.estimate_number}</p>
                      <p className="text-xs text-gray-500">{est.estimate_number}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(est.total)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {data.projects.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Your Projects</h2>
              <div className="space-y-3">
                {data.projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/portal/projects/${project.id}`}
                    className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{project.name}</h3>
                        {project.location && (
                          <p className="text-xs text-gray-500 mt-0.5">{project.location}</p>
                        )}
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColor(project.status)}`}>
                        {project.status.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1.5">
                      <div
                        className="h-1.5 rounded-full bg-blue-600 transition-all"
                        style={{ width: `${project.percent_complete || 0}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400">{project.percent_complete || 0}% complete</p>

                    {/* Book Again for completed projects */}
                    {project.status === "completed" && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <span className="text-xs text-blue-600 font-medium">
                          Book again →
                        </span>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Service Plans */}
          {data.servicePlans.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Service Plans</h2>
              <div className="space-y-3">
                {data.servicePlans.map((plan) => (
                  <Link
                    key={plan.id}
                    href={`/portal/services/${plan.id}`}
                    className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{plan.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5 capitalize">
                          {plan.service_type.replace(/_/g, " ")} · {plan.billing_cycle.replace(/_/g, " ")}
                        </p>
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        plan.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {plan.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {data.projects.length === 0 && data.servicePlans.length === 0 && (
            <div className="text-center py-20">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">No projects shared with you yet.</p>
            </div>
          )}
        </div>
      ) : null}
    </PortalShell>
  );
}
