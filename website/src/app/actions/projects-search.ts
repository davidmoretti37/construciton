"use server";

import { createClient } from "@/lib/supabase-server";
import type { ProjectStatus } from "@/types";

const ALLOWED_STATUSES: readonly ProjectStatus[] = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
];

export interface ProjectListItem {
  id: string;
  name: string;
  status: string;
  contract_amount: number;
  income_collected: number;
  client_name: string | null;
  location: string | null;
  updated_at: string | null;
  created_at: string;
}

export interface ProjectsSearchState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"q" | "status", string>>;
  query: string;
  status: string;
  results: ProjectListItem[];
}

const INITIAL: ProjectsSearchState = {
  ok: true,
  query: "",
  status: "all",
  results: [],
};

export async function searchProjects(
  _prev: ProjectsSearchState | undefined,
  formData: FormData,
): Promise<ProjectsSearchState> {
  const qRaw = String(formData.get("q") ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  const statusRaw = String(formData.get("status") ?? "all").trim();

  const fieldErrors: ProjectsSearchState["fieldErrors"] = {};
  if (qRaw.length > 200) fieldErrors.q = "Search is too long";
  if (statusRaw !== "all" && !ALLOWED_STATUSES.includes(statusRaw as ProjectStatus)) {
    fieldErrors.status = "Invalid status";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ...INITIAL, ok: false, error: "Validation failed", fieldErrors, query: qRaw, status: statusRaw };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ...INITIAL, ok: false, error: "Not authenticated", query: qRaw, status: statusRaw };
  }

  let query = supabase
    .from("projects")
    .select(
      "id, name, status, contract_amount, income_collected, client_name, location, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (statusRaw !== "all") {
    query = query.eq("status", statusRaw);
  }
  if (qRaw) {
    const escaped = qRaw.replace(/[%,]/g, "");
    query = query.or(
      `name.ilike.%${escaped}%,client_name.ilike.%${escaped}%,location.ilike.%${escaped}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return { ...INITIAL, ok: false, error: error.message, query: qRaw, status: statusRaw };
  }

  const results: ProjectListItem[] = (data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.name as string) ?? "",
    status: (p.status as string) ?? "planning",
    contract_amount: Number(p.contract_amount ?? 0),
    income_collected: Number(p.income_collected ?? 0),
    client_name: (p.client_name as string | null) ?? null,
    location: (p.location as string | null) ?? null,
    updated_at: (p.updated_at as string | null) ?? null,
    created_at: (p.created_at as string) ?? "",
  }));

  return { ok: true, query: qRaw, status: statusRaw, results };
}
