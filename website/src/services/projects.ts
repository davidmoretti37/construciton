import type { SupabaseClient } from "@supabase/supabase-js";

export interface Project {
  id: string;
  name: string;
  status: string;
  contract_amount: number;
  income_collected: number;
  expenses: number;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  actual_progress?: number;
  task_description?: string;
  user_id: string;
  assigned_supervisor_id?: string;
  assignment_status?: string;
  managed_by_name?: string;
  created_at: string;
}

export interface ServicePlan {
  id: string;
  name: string;
  service_type: string;
  status: string;
  billing_cycle: string;
  price_per_visit?: number;
  monthly_price?: number;
  locations_count: number;
  visits_this_month: number;
  completed_this_month: number;
  created_at: string;
}

export async function fetchProjects(supabase: SupabaseClient, userId: string): Promise<Project[]> {
  // Get supervisor IDs
  const { data: supervisors } = await supabase
    .from("profiles")
    .select("id")
    .eq("owner_id", userId)
    .eq("role", "supervisor");

  const supervisorIds = (supervisors || []).map((s) => s.id);

  const supervisorNames: Record<string, string> = {};

  // Fetch owner's projects
  const { data: ownerProjects, error: ownerErr } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (ownerErr) console.warn("[Projects] owner query:", ownerErr.message);

  let allProjects = (ownerProjects || []) as Project[];

  // Fetch supervisor projects
  for (const supId of supervisorIds) {
    const { data: supProjects } = await supabase
      .from("projects")
      .select("*")
      .eq("assigned_supervisor_id", supId)
      .order("created_at", { ascending: false });

    if (supProjects) {
      const existingIds = new Set(allProjects.map((p) => p.id));
      const newOnes = (supProjects as Project[]).filter((p) => !existingIds.has(p.id));
      allProjects = [...allProjects, ...newOnes];
    }
  }

  // Look up names for ALL assigned supervisor IDs found in projects
  const allSupIds = [...new Set(allProjects.filter((p) => p.assigned_supervisor_id).map((p) => p.assigned_supervisor_id!))];
  if (allSupIds.length > 0) {
    const { data: supProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, business_name, email")
      .in("id", allSupIds);
    for (const s of supProfiles || []) {
      supervisorNames[s.id] = s.business_name || s.full_name || s.email || "Supervisor";
    }
  }

  // Attach supervisor names
  for (const p of allProjects) {
    if (p.assigned_supervisor_id) {
      p.managed_by_name = supervisorNames[p.assigned_supervisor_id] || undefined;
    }
  }

  return allProjects;
}

export async function fetchServicePlans(supabase: SupabaseClient, userId: string): Promise<ServicePlan[]> {
  const { data, error } = await supabase
    .from("service_plans")
    .select("*")
    .eq("owner_id", userId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[ServicePlans]", error.message);
    return [];
  }

  return (data || []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    name: p.name as string || "",
    service_type: p.service_type as string || "other",
    status: p.status as string || "active",
    billing_cycle: p.billing_cycle as string || "per_visit",
    price_per_visit: p.price_per_visit as number || 0,
    monthly_price: p.monthly_price as number || 0,
    locations_count: p.locations_count as number || 0,
    visits_this_month: p.visits_this_month as number || 0,
    completed_this_month: p.completed_this_month as number || 0,
    created_at: p.created_at as string || "",
  }));
}
