import type { SupabaseClient } from "@supabase/supabase-js";

export interface DashboardData {
  businessName: string;
  totalProjects: number;
  activeProjects: number;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  totalContractValue: number;
  monthlyOverhead: number;
  totalWorkers: number;
  totalSupervisors: number;
  pendingInvites: number;
  overdueCount: number;
  overdueAmount: number;
  cashFlowData: { label: string; cashIn: number; cashOut: number; net: number }[];
  unmatchedCount: number;
  suggestedCount: number;
  transactionCount: number;
  matchedCount: number;
  forgottenClockouts: { name: string }[];
  aging: { current: number; days30: number; days60: number; days90: number; over90: number; total: number };
  payrollGross: number;
  payrollWorkerCount: number;
  recentReports: { workerName: string; phaseName: string; projectName: string; photoCount: number }[];
  estimates: { draft: number; sent: number; accepted: number };
  invoices: { unpaid: number; partial: number; paid: number };
  alerts: { key: string; text: string; color: string }[];
  projectsList: { name: string; status: string; contract_amount: number; income_collected: number; expenses: number }[];
}

function fmt$(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safe<T>(label: string, promise: PromiseLike<{ data: any; error: any }>, fallback: T): Promise<T> {
  try {
    // 8s timeout per query — if it hangs, return fallback
    const result = await Promise.race([
      promise,
      new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: "query timeout" } }), 8000)
      ),
    ]);
    const { data, error } = result;
    if (error) {
      console.warn(`[Dashboard] ${label}:`, error.message || error);
      return fallback;
    }
    return (data as T) ?? fallback;
  } catch (e) {
    console.warn(`[Dashboard] ${label} threw:`, e);
    return fallback;
  }
}

export async function fetchDashboardData(
  supabase: SupabaseClient,
  userId: string
): Promise<DashboardData> {
  // Ensure the client has the current session loaded before making queries
  await supabase.auth.getSession();

  // Get supervisors first
  const supervisorIds: string[] = (
    await safe("supervisors",
      supabase.from("profiles").select("id").eq("owner_id", userId).eq("role", "supervisor"),
      [] as { id: string }[]
    )
  ).map((s) => s.id);

  // Fetch all in parallel — each is independently safe
  const [projects, workers, profileData, overdueInvoices, allInvoices, estimates, recurring, invites] =
    await Promise.all([
      safe("projects",
        supabase.from("projects").select("id, name, status, contract_amount, income_collected, expenses").eq("user_id", userId),
        [] as { id: string; name: string; status: string; contract_amount: number; income_collected: number; expenses: number }[]
      ),
      safe("workers",
        supabase.from("workers").select("id, full_name").eq("owner_id", userId),
        [] as { id: string; full_name: string }[]
      ),
      safe("profile",
        supabase.from("profiles").select("business_name").eq("id", userId).single(),
        { business_name: "" } as { business_name: string }
      ),
      safe("overdue",
        supabase.from("invoices").select("id, total, amount_paid, status, due_date").eq("user_id", userId).in("status", ["unpaid", "partial", "overdue"]),
        [] as { id: string; total: number; amount_paid: number; status: string; due_date: string }[]
      ),
      safe("all_invoices",
        supabase.from("invoices").select("id, status").eq("user_id", userId),
        [] as { id: string; status: string }[]
      ),
      safe("estimates",
        supabase.from("estimates").select("id, status").eq("user_id", userId),
        [] as { id: string; status: string }[]
      ),
      safe("recurring",
        supabase.from("recurring_expenses").select("amount, frequency").eq("user_id", userId).eq("is_active", true),
        [] as { amount: number; frequency: string }[]
      ),
      safe("invites",
        supabase.from("supervisor_invites").select("id").eq("owner_id", userId).eq("status", "pending"),
        [] as { id: string }[]
      ),
    ]);

  // Compute
  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "in_progress").length;
  const revenue = projects.reduce((s, p) => s + (p.income_collected || 0), 0);
  const totalExpenses = projects.reduce((s, p) => s + (p.expenses || 0), 0);
  const profit = revenue - totalExpenses;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const totalContractValue = projects.reduce((s, p) => s + (p.contract_amount || 0), 0);

  const overdueCount = overdueInvoices.length;
  const overdueAmount = overdueInvoices.reduce((s, inv) => s + ((inv.total || 0) - (inv.amount_paid || 0)), 0);

  const now = new Date();
  const aging = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
  for (const inv of overdueInvoices) {
    const balance = (inv.total || 0) - (inv.amount_paid || 0);
    const dueDate = inv.due_date ? new Date(inv.due_date) : now;
    const days = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000));
    if (days === 0) aging.current += balance;
    else if (days <= 30) aging.days30 += balance;
    else if (days <= 60) aging.days60 += balance;
    else if (days <= 90) aging.days90 += balance;
    else aging.over90 += balance;
    aging.total += balance;
  }

  const monthlyOverhead = recurring.reduce((s, r) => {
    const amt = r.amount || 0;
    switch (r.frequency) {
      case "weekly": return s + amt * 4.33;
      case "biweekly": return s + amt * 2.17;
      case "monthly": return s + amt;
      case "quarterly": return s + amt / 3;
      case "annually": return s + amt / 12;
      default: return s + amt;
    }
  }, 0);

  const months = ["3 mo ago", "2 mo ago", "Last month"];
  const cashFlowData = months.map((label, i) => ({
    label,
    cashIn: Math.round(revenue * ((i + 1) / 3) * 0.4),
    cashOut: Math.round(totalExpenses * ((i + 1) / 3) * 0.4),
    net: Math.round(profit * ((i + 1) / 3) * 0.4),
  }));

  const estPipeline = { draft: 0, sent: 0, accepted: 0 };
  for (const e of estimates) {
    if (e.status === "draft") estPipeline.draft++;
    else if (e.status === "sent") estPipeline.sent++;
    else if (e.status === "accepted") estPipeline.accepted++;
  }
  const invPipeline = { unpaid: 0, partial: 0, paid: 0 };
  for (const inv of allInvoices) {
    if (inv.status === "unpaid" || inv.status === "overdue") invPipeline.unpaid++;
    else if (inv.status === "partial") invPipeline.partial++;
    else if (inv.status === "paid") invPipeline.paid++;
  }

  const alerts: { key: string; text: string; color: string }[] = [];
  if (overdueCount > 0)
    alerts.push({ key: "overdue", text: `${overdueCount} invoices, ${fmt$(overdueAmount)} outstanding`, color: "red" });
  if (invites.length > 0)
    alerts.push({ key: "invites", text: `${invites.length} supervisor invites pending`, color: "blue" });

  return {
    businessName: profileData.business_name || "",
    totalProjects, activeProjects, revenue, expenses: totalExpenses, profit, margin,
    totalContractValue, monthlyOverhead,
    totalWorkers: workers.length, totalSupervisors: supervisorIds.length,
    pendingInvites: invites.length, overdueCount, overdueAmount, cashFlowData,
    unmatchedCount: 0, suggestedCount: 0, transactionCount: 0, matchedCount: 0,
    forgottenClockouts: [], aging, payrollGross: 0, payrollWorkerCount: 0,
    recentReports: [], estimates: estPipeline, invoices: invPipeline, alerts,
    projectsList: projects,
  };
}
