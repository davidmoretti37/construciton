import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safe<T>(label: string, promise: PromiseLike<{ data: any; error: any }>, fallback: T): Promise<T> {
  try {
    const result = await Promise.race([
      promise,
      new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: "timeout" } }), 8000)
      ),
    ]);
    const { data, error } = result;
    if (error) { console.warn(`[ProjectDetail] ${label}:`, error.message || error); return fallback; }
    return (data as T) ?? fallback;
  } catch (e) { console.warn(`[ProjectDetail] ${label} threw:`, e); return fallback; }
}

export interface Phase {
  id: string;
  name: string;
  status: string;
  completion_percentage: number;
  order_index: number;
  planned_days?: number;
  start_date?: string;
  end_date?: string;
  budget?: number;
  tasks: Task[];
}

export interface Task {
  id: string;
  title: string;
  status: string;
  order: number;
  description?: string;
  start_date?: string;
  end_date?: string;
}

export interface Worker {
  id: string;
  full_name: string;
  trade?: string;
  phone?: string;
}

export interface DailyReport {
  id: string;
  report_date: string;
  reporter_type: string;
  reporter_name: string;
  photo_count: number;
  summary?: string;
}

export interface ProjectDocument {
  id: string;
  file_name: string;
  file_type: string;
  created_at: string;
  visible_to_workers: boolean;
}

export interface Estimate {
  id: string;
  estimate_number?: string;
  status: string;
  total: number;
  created_at: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  status: string;
  contract_amount: number;
  income_collected: number;
  expenses: number;
  profit: number;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  location?: string;
  task_description?: string;
  start_date?: string;
  end_date?: string;
  days_remaining?: number;
  working_days?: number[];
  actual_progress?: number;
  assigned_supervisor_id?: string;
  supervisor_name?: string;
  phases: Phase[];
  workers: Worker[];
  reports: DailyReport[];
  documents: ProjectDocument[];
  estimates: Estimate[];
}

export async function fetchProjectDetail(supabase: SupabaseClient, projectId: string): Promise<ProjectDetail | null> {
  // Main project
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project: any = await safe("project", supabase.from("projects").select("*").eq("id", projectId).single(), null);
  if (!project) return null;

  // Parallel fetch related data
  const [phases, workers, reports, documents, estimates, supervisorProfile] = await Promise.all([
    // Phases (tasks are stored as JSON column inside project_phases)
    safe("phases", supabase.from("project_phases").select("id, name, order_index, status, completion_percentage, planned_days, start_date, end_date, budget, tasks").eq("project_id", projectId).order("order_index"), [] as Record<string, unknown>[]),
    // Workers
    safe("workers", supabase.from("project_workers").select("worker_id, workers(id, full_name, trade, phone)").eq("project_id", projectId), [] as Record<string, unknown>[]),
    // Daily reports (last 10)
    safe("reports", supabase.from("daily_reports").select("id, report_date, reporter_type, photos, tags, workers(full_name)").eq("project_id", projectId).order("report_date", { ascending: false }).limit(10), [] as Record<string, unknown>[]),
    // Documents
    safe("documents", supabase.from("project_documents").select("*").eq("project_id", projectId).order("created_at", { ascending: false }), [] as ProjectDocument[]),
    // Estimates
    safe("estimates", supabase.from("estimates").select("id, estimate_number, status, total, created_at").eq("project_id", projectId).order("created_at", { ascending: false }), [] as Estimate[]),
    // Supervisor name
    project.assigned_supervisor_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? safe<any>("supervisor", supabase.from("profiles").select("full_name, business_name").eq("id", project.assigned_supervisor_id).single(), null)
      : Promise.resolve(null),
  ]);

  // Also fetch worker_tasks to get completion status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workerTasks = await safe<any[]>("worker_tasks", supabase.from("worker_tasks").select("phase_task_id, status").eq("project_id", projectId), []);
  const taskStatusMap: Record<string, string> = {};
  for (const wt of workerTasks || []) {
    if (wt.phase_task_id) taskStatusMap[wt.phase_task_id] = wt.status;
  }

  // Build phases with tasks from JSON column
  const phasesWithTasks: Phase[] = (phases as Record<string, unknown>[]).map((phase) => {
    const rawTasks = Array.isArray(phase.tasks) ? phase.tasks : [];
    const tasks: Task[] = rawTasks.map((t: Record<string, unknown>, idx: number) => ({
      id: (t.id as string) || `task-${idx}`,
      title: (t.description as string) || (t.title as string) || (t.name as string) || `Task ${idx + 1}`,
      status: taskStatusMap[t.id as string] || (t.status as string) || (t.completed ? "completed" : "pending"),
      order: (t.order as number) || idx,
      description: (t.description as string) || undefined,
      start_date: (t.start_date as string) || undefined,
      end_date: (t.end_date as string) || undefined,
    }));

    return {
      id: phase.id as string,
      name: (phase.name as string) || "",
      status: (phase.status as string) || "not_started",
      completion_percentage: (phase.completion_percentage as number) || 0,
      order_index: (phase.order_index as number) || 0,
      planned_days: phase.planned_days as number | undefined,
      start_date: phase.start_date as string | undefined,
      end_date: phase.end_date as string | undefined,
      budget: phase.budget as number | undefined,
      tasks,
    };
  });

  // Transform workers
  const workerList: Worker[] = (workers || []).map((w: Record<string, unknown>) => {
    const worker = w.workers as Record<string, unknown> | null;
    return {
      id: (worker?.id as string) || "",
      full_name: (worker?.full_name as string) || "Unknown",
      trade: worker?.trade as string | undefined,
      phone: worker?.phone as string | undefined,
    };
  }).filter((w) => w.id);

  // Transform reports
  const reportList: DailyReport[] = (reports || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    report_date: r.report_date as string || "",
    reporter_type: r.reporter_type as string || "worker",
    reporter_name: (r.workers as Record<string, string>)?.full_name || "Unknown",
    photo_count: Array.isArray(r.photos) ? r.photos.length : 0,
    summary: Array.isArray(r.tags) && r.tags.length > 0 ? r.tags[0] : undefined,
  }));

  const income = project.income_collected || 0;
  const exp = project.expenses || project.spent || 0;

  return {
    id: project.id,
    name: project.name || "",
    status: project.status || "active",
    contract_amount: project.contract_amount || project.budget || 0,
    income_collected: income,
    expenses: exp,
    profit: income - exp,
    client_name: project.client || project.client_name || undefined,
    client_phone: project.client_phone || undefined,
    client_email: project.client_email || undefined,
    location: project.location || undefined,
    task_description: project.task_description || undefined,
    start_date: project.start_date || undefined,
    end_date: project.end_date || undefined,
    days_remaining: project.days_remaining || undefined,
    working_days: project.working_days || undefined,
    actual_progress: project.actual_progress || 0,
    assigned_supervisor_id: project.assigned_supervisor_id || undefined,
    supervisor_name: supervisorProfile?.business_name || supervisorProfile?.full_name || undefined,
    phases: phasesWithTasks,
    workers: workerList,
    reports: reportList,
    documents: documents as ProjectDocument[],
    estimates: estimates as Estimate[],
  };
}

export interface ServicePlanDetail {
  id: string;
  name: string;
  status: string;
  service_type: string;
  billing_cycle: string;
  price_per_visit: number;
  monthly_price: number;
  schedule_days?: string[];
  schedule_frequency?: string;
  locations: { id: string; name: string; address: string }[];
  visits_this_month: number;
  completed_this_month: number;
}

export async function fetchServicePlanDetail(supabase: SupabaseClient, planId: string): Promise<ServicePlanDetail | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan: any = await safe("plan", supabase.from("service_plans").select("*").eq("id", planId).single(), null);
  if (!plan) return null;

  const locations = await safe("locations", supabase.from("service_locations").select("id, name, address").eq("service_plan_id", planId), [] as { id: string; name: string; address: string }[]);

  return {
    id: plan.id,
    name: plan.name || "",
    status: plan.status || "active",
    service_type: plan.service_type || "other",
    billing_cycle: plan.billing_cycle || "per_visit",
    price_per_visit: plan.price_per_visit || 0,
    monthly_price: plan.monthly_price || 0,
    schedule_days: plan.schedule_days || undefined,
    schedule_frequency: plan.schedule_frequency || undefined,
    locations,
    visits_this_month: plan.visits_this_month || 0,
    completed_this_month: plan.completed_this_month || 0,
  };
}
