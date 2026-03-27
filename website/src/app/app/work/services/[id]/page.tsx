"use client";

import { useState, useEffect, useCallback, use } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { fetchServicePlanDetail, type ServicePlanDetail } from "@/services/projectDetail";

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

const serviceTypeColors: Record<string, { bg: string; text: string }> = {
  pest_control: { bg: "bg-red-50", text: "text-red-600" },
  cleaning: { bg: "bg-violet-50", text: "text-violet-600" },
  landscaping: { bg: "bg-emerald-50", text: "text-emerald-600" },
  pool_service: { bg: "bg-blue-50", text: "text-blue-600" },
  lawn_care: { bg: "bg-green-50", text: "text-green-600" },
  hvac: { bg: "bg-amber-50", text: "text-amber-600" },
  other: { bg: "bg-gray-50", text: "text-gray-600" },
};

export default function ServicePlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [plan, setPlan] = useState<ServicePlanDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true } }
    );
    const data = await fetchServicePlanDetail(supabase, id);
    setPlan(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#1E40AF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="px-4 md:px-0 py-8">
        <Link href="/app/work" className="text-sm text-[#1E40AF] hover:underline">&larr; Back to Work</Link>
        <p className="text-gray-400 text-sm mt-8 text-center">Service plan not found</p>
      </div>
    );
  }

  const typeColor = serviceTypeColors[plan.service_type] || serviceTypeColors.other;
  const price = plan.billing_cycle === "monthly" ? plan.monthly_price : plan.price_per_visit;
  const priceLabel = plan.billing_cycle === "monthly" ? "/month" : "/visit";
  const visitPct = plan.visits_this_month > 0 ? (plan.completed_this_month / plan.visits_this_month) * 100 : 0;

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
          <h1 className="text-xl font-bold text-gray-900 truncate">{plan.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${typeColor.bg} ${typeColor.text}`}>
              {plan.service_type.replace(/[_-]/g, " ")}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${plan.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
              {plan.status}
            </span>
          </div>
        </div>
      </div>

      {/* ─── PRICING ─── */}
      <section className="mb-8">
        <SectionHeader title="Pricing" />
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-3xl font-bold text-[#1E40AF]">{fmt$(price)}<span className="text-sm font-normal text-gray-400">{priceLabel}</span></p>
          <p className="text-xs text-gray-400 mt-1 capitalize">{plan.billing_cycle.replace("_", " ")} billing</p>
        </div>
      </section>

      {/* ─── VISIT PROGRESS ─── */}
      {plan.visits_this_month > 0 && (
        <section className="mb-8">
          <SectionHeader title="This Month" />
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>{plan.completed_this_month} of {plan.visits_this_month} visits completed</span>
              <span>{visitPct.toFixed(0)}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full">
              <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${visitPct}%` }} />
            </div>
          </div>
        </section>
      )}

      {/* ─── SCHEDULE ─── */}
      {(plan.schedule_days || plan.schedule_frequency) && (
        <section className="mb-8">
          <SectionHeader title="Schedule" />
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            {plan.schedule_days && (
              <p className="text-sm text-gray-700">{Array.isArray(plan.schedule_days) ? plan.schedule_days.join(", ") : plan.schedule_days}</p>
            )}
            {plan.schedule_frequency && (
              <p className="text-xs text-gray-400 mt-1 capitalize">{plan.schedule_frequency}</p>
            )}
          </div>
        </section>
      )}

      {/* ─── LOCATIONS ─── */}
      <section className="mb-8">
        <SectionHeader title="Locations" right={<span className="text-[11px] text-gray-400">{plan.locations.length}</span>} />
        {plan.locations.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">No locations added</div>
        ) : (
          <div className="space-y-2">
            {plan.locations.map((loc) => (
              <div key={loc.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-medium text-gray-900">{loc.name}</p>
                {loc.address && <p className="text-xs text-gray-400 mt-0.5">{loc.address}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="h-16" />
    </div>
  );
}
