"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PortalShell from "@/components/portal/PortalShell";
import { fetchServicePlan, type PortalServicePlan } from "@/services/portal";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function PortalServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<PortalServicePlan | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    if (id) {
      fetchServicePlan(id)
        .then(setPlan)
        .catch((err) => setError(err instanceof Error ? err.message : "Service plan not found"))
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) {
    return (
      <PortalShell>
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </PortalShell>
    );
  }

  if (!plan) {
    return (
      <PortalShell>
        <div className="text-center py-20">
          <p className="text-sm text-gray-500">{error || "Service plan not found."}</p>
          <Link href="/portal/services" className="text-sm text-blue-600 mt-2 inline-block">Back</Link>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <div className="space-y-6">
        <Link href="/portal/services" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Services
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{plan.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5 capitalize">
                {plan.service_type.replace(/_/g, " ")} · {plan.billing_cycle.replace(/_/g, " ")}
              </p>
            </div>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              plan.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}>
              {plan.status}
            </span>
          </div>
          {plan.price_per_visit && (
            <p className="text-sm text-gray-600 mt-3">${plan.price_per_visit} per visit</p>
          )}
          {plan.monthly_rate && (
            <p className="text-sm text-gray-600 mt-1">${plan.monthly_rate}/month</p>
          )}
        </div>

        {/* Locations */}
        {plan.locations && plan.locations.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Locations</h2>
            <div className="space-y-2">
              {plan.locations.map((loc) => (
                <div key={loc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{loc.name}</p>
                    <p className="text-xs text-gray-500">{loc.address}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent Visits */}
        {plan.recentVisits && plan.recentVisits.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent Visits</h2>
            <div className="space-y-2">
              {plan.recentVisits.map((visit) => (
                <div key={visit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-900">{formatDate(visit.scheduled_date)}</p>
                    {visit.worker_notes && (
                      <p className="text-xs text-gray-500 mt-0.5">{visit.worker_notes}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    visit.status === "completed" ? "bg-green-100 text-green-700" :
                    visit.status === "scheduled" ? "bg-blue-100 text-blue-700" :
                    visit.status === "skipped" ? "bg-gray-100 text-gray-500" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {visit.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PortalShell>
  );
}
