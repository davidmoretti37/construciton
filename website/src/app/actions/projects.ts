"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { ProjectStatus } from "@/types";

const ALLOWED_STATUSES: readonly ProjectStatus[] = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ProjectFormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<
    Record<
      | "name"
      | "status"
      | "contract_amount"
      | "client_name"
      | "client_email"
      | "client_phone"
      | "location"
      | "start_date"
      | "end_date"
      | "task_description"
      | "auth",
      string
    >
  >;
  projectId?: string;
}

interface ProjectInput {
  name: string;
  status: ProjectStatus;
  contract_amount: number;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  task_description: string | null;
}

function sanitize(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function parseAndValidate(formData: FormData): {
  data: ProjectInput | null;
  fieldErrors: ProjectFormState["fieldErrors"];
} {
  const fieldErrors: ProjectFormState["fieldErrors"] = {};

  const name = sanitize(String(formData.get("name") ?? ""));
  const statusRaw = sanitize(String(formData.get("status") ?? "planning")) as ProjectStatus;
  const contractRaw = sanitize(String(formData.get("contract_amount") ?? "0"));
  const clientName = sanitize(String(formData.get("client_name") ?? ""));
  const clientPhone = sanitize(String(formData.get("client_phone") ?? ""));
  const clientEmail = sanitize(String(formData.get("client_email") ?? "")).toLowerCase();
  const location = sanitize(String(formData.get("location") ?? ""));
  const startDate = sanitize(String(formData.get("start_date") ?? ""));
  const endDate = sanitize(String(formData.get("end_date") ?? ""));
  const taskDescription = sanitize(String(formData.get("task_description") ?? ""));

  if (!name || name.length < 2) fieldErrors.name = "Project name is required";
  else if (name.length > 200) fieldErrors.name = "Project name is too long";

  if (!ALLOWED_STATUSES.includes(statusRaw)) fieldErrors.status = "Invalid status";

  const contractAmount = Number(contractRaw.replace(/[,$\s]/g, ""));
  if (!Number.isFinite(contractAmount) || contractAmount < 0)
    fieldErrors.contract_amount = "Contract amount must be ≥ 0";
  else if (contractAmount > 1_000_000_000)
    fieldErrors.contract_amount = "Contract amount is too large";

  if (clientName.length > 200) fieldErrors.client_name = "Client name is too long";
  if (clientPhone.length > 40) fieldErrors.client_phone = "Phone is too long";
  if (clientEmail && !EMAIL_RE.test(clientEmail)) fieldErrors.client_email = "Invalid email";
  if (location.length > 500) fieldErrors.location = "Location is too long";
  if (startDate && !ISO_DATE_RE.test(startDate)) fieldErrors.start_date = "Use YYYY-MM-DD";
  if (endDate && !ISO_DATE_RE.test(endDate)) fieldErrors.end_date = "Use YYYY-MM-DD";
  if (startDate && endDate && startDate > endDate)
    fieldErrors.end_date = "End date must be after start date";
  if (taskDescription.length > 5000)
    fieldErrors.task_description = "Description is too long (max 5000)";

  if (Object.keys(fieldErrors).length > 0) return { data: null, fieldErrors };

  return {
    data: {
      name,
      status: statusRaw,
      contract_amount: contractAmount,
      client_name: clientName || null,
      client_phone: clientPhone || null,
      client_email: clientEmail || null,
      location: location || null,
      start_date: startDate || null,
      end_date: endDate || null,
      task_description: taskDescription || null,
    },
    fieldErrors: {},
  };
}

export async function createProject(
  _prev: ProjectFormState | undefined,
  formData: FormData,
): Promise<ProjectFormState> {
  const { data, fieldErrors } = parseAndValidate(formData);
  if (!data) return { ok: false, error: "Validation failed", fieldErrors };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated", fieldErrors: { auth: "Please sign in" } };
  }

  const { data: row, error } = await supabase
    .from("projects")
    .insert({ ...data, user_id: user.id })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/app/work");
  revalidatePath("/app");

  return { ok: true, projectId: row?.id as string };
}

export async function updateProject(
  projectId: string,
  _prev: ProjectFormState | undefined,
  formData: FormData,
): Promise<ProjectFormState> {
  if (!projectId || projectId.length > 64) {
    return { ok: false, error: "Invalid project id" };
  }
  const { data, fieldErrors } = parseAndValidate(formData);
  if (!data) return { ok: false, error: "Validation failed", fieldErrors };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated", fieldErrors: { auth: "Please sign in" } };
  }

  const { error } = await supabase
    .from("projects")
    .update(data)
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/app/work");
  revalidatePath(`/app/work/projects/${projectId}`);

  return { ok: true, projectId };
}

export async function deleteProject(projectId: string): Promise<ProjectFormState> {
  if (!projectId || projectId.length > 64) {
    return { ok: false, error: "Invalid project id" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/work");
  return { ok: true, projectId };
}
