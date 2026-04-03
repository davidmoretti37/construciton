"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "@/components/portal/PortalShell";
import { fetchServicePlans, type PortalServicePlan } from "@/services/portal";

export default function PortalServicesPage() {
  const [plans, setPlans] = useState<PortalServicePlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchServicePlans()
      .then(setPlans)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <PortalShell>
      <h1 className="text-lg font-bold text-gray-900 mb-4">Service Plans</h1>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-gray-500">No active service plans.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
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
                <div className="text-right">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    plan.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {plan.status}
                  </span>
                  {plan.price_per_visit && (
                    <p className="text-xs text-gray-500 mt-1">
                      ${plan.price_per_visit}/visit
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
