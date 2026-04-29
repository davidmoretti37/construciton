"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { safe } from "@/lib/safe";
import type { DbContract } from "@/types/database";

const ALLOWED_CONTRACT_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "signed",
  "declined",
  "expired",
  "void",
] as const;
type ContractStatus = (typeof ALLOWED_CONTRACT_STATUSES)[number];

type ContractFieldKey =
  | "title"
  | "status"
  | "client_id"
  | "project_id"
  | "template_id"
  | "body"
  | "auth";

export interface ContractFormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<ContractFieldKey, string>>;
  contractId?: string;
  contracts?: DbContract[];
}

interface ContractInput {
  title: string;
  status: ContractStatus;
  client_id: string | null;
  project_id: string | null;
  template_id: string | null;
  body: string | null;
}

function sanitize(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function parseAndValidate(formData: FormData): {
  data: ContractInput | null;
  fieldErrors: ContractFormState["fieldErrors"];
} {
  const fieldErrors: ContractFormState["fieldErrors"] = {};

  const title = sanitize(String(formData.get("title") ?? ""));
  const statusRaw = sanitize(String(formData.get("status") ?? "draft")) as ContractStatus;
  const clientId = sanitize(String(formData.get("client_id") ?? ""));
  const projectId = sanitize(String(formData.get("project_id") ?? ""));
  const templateId = sanitize(String(formData.get("template_id") ?? ""));
  const body = String(formData.get("body") ?? "")
    .replace(/[\u0000\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

  if (!title || title.length < 2) fieldErrors.title = "Title must be at least 2 characters";
  else if (title.length > 200) fieldErrors.title = "Title is too long";

  if (!ALLOWED_CONTRACT_STATUSES.includes(statusRaw)) fieldErrors.status = "Invalid status";

  if (clientId.length > 64) fieldErrors.client_id = "Invalid client id";
  if (projectId.length > 64) fieldErrors.project_id = "Invalid project id";
  if (templateId.length > 64) fieldErrors.template_id = "Invalid template id";

  if (body.length > 100_000) fieldErrors.body = "Contract body is too long (max 100,000)";

  if (Object.keys(fieldErrors).length > 0) return { data: null, fieldErrors };

  return {
    data: {
      title,
      status: statusRaw,
      client_id: clientId || null,
      project_id: projectId || null,
      template_id: templateId || null,
      body: body || null,
    },
    fieldErrors: {},
  };
}

export async function createContract(
  _prev: ContractFormState | undefined,
  formData: FormData,
): Promise<ContractFormState> {
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
    .from("contracts")
    .insert({ ...data, user_id: user.id })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message.includes("does not exist")
        ? "Contracts table is not configured for this deployment"
        : error.message,
    };
  }

  revalidatePath("/app/money/contracts");
  return { ok: true, contractId: row?.id as string };
}

export async function updateContract(
  contractId: string,
  _prev: ContractFormState | undefined,
  formData: FormData,
): Promise<ContractFormState> {
  if (!contractId || contractId.length > 64) return { ok: false, error: "Invalid contract id" };
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
    .from("contracts")
    .update(data)
    .eq("id", contractId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/money/contracts");
  revalidatePath(`/app/money/contracts/${contractId}`);
  return { ok: true, contractId };
}

export async function deleteContract(contractId: string): Promise<ContractFormState> {
  if (!contractId || contractId.length > 64) return { ok: false, error: "Invalid contract id" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("contracts")
    .delete()
    .eq("id", contractId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/money/contracts");
  return { ok: true, contractId };
}

export async function listContracts(): Promise<DbContract[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return safe<DbContract[]>(
    "contracts.list",
    supabase
      .from("contracts")
      .select(
        "id, user_id, project_id, client_id, title, status, template_id, document_id, body, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    [],
  );
}
