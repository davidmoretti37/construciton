"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { DbInvoiceLineItem } from "@/types/database";

const ALLOWED_ESTIMATE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "converted",
] as const;
type EstimateStatus = (typeof ALLOWED_ESTIMATE_STATUSES)[number];

type EstimateFieldKey =
  | "estimate_number"
  | "status"
  | "total"
  | "client_id"
  | "project_id"
  | "line_items"
  | "auth";

export interface EstimateFormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<EstimateFieldKey, string>>;
  estimateId?: string;
  invoiceId?: string;
}

interface EstimateInput {
  estimate_number: string;
  status: EstimateStatus;
  total: number;
  client_id: string | null;
  project_id: string | null;
  line_items: DbInvoiceLineItem[] | null;
}

function sanitize(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function parseLineItems(raw: string): {
  items: DbInvoiceLineItem[] | null;
  error?: string;
} {
  if (!raw) return { items: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { items: null, error: "Line items must be valid JSON" };
  }
  if (!Array.isArray(parsed)) return { items: null, error: "Line items must be an array" };
  if (parsed.length > 200) return { items: null, error: "Too many line items (max 200)" };

  const items: DbInvoiceLineItem[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      return { items: null, error: "Invalid line item shape" };
    }
    const e = entry as Record<string, unknown>;
    const description = typeof e.description === "string" ? sanitize(e.description) : "";
    const quantity = Number(e.quantity);
    const unitPrice = Number(e.unit_price ?? e.unitPrice);
    if (!description) return { items: null, error: "Line item description required" };
    if (description.length > 500) return { items: null, error: "Line description too long" };
    if (!Number.isFinite(quantity) || quantity < 0)
      return { items: null, error: "Quantity must be ≥ 0" };
    if (!Number.isFinite(unitPrice) || unitPrice < 0)
      return { items: null, error: "Unit price must be ≥ 0" };
    items.push({
      description,
      quantity,
      unit_price: unitPrice,
      amount: Math.round(quantity * unitPrice * 100) / 100,
    });
  }
  return { items };
}

function parseAndValidate(formData: FormData): {
  data: EstimateInput | null;
  fieldErrors: EstimateFormState["fieldErrors"];
} {
  const fieldErrors: EstimateFormState["fieldErrors"] = {};

  const estimateNumber = sanitize(String(formData.get("estimate_number") ?? ""));
  const statusRaw = sanitize(String(formData.get("status") ?? "draft")) as EstimateStatus;
  const totalRaw = sanitize(String(formData.get("total") ?? "0"));
  const clientId = sanitize(String(formData.get("client_id") ?? ""));
  const projectId = sanitize(String(formData.get("project_id") ?? ""));
  const lineItemsRaw = String(formData.get("line_items") ?? "").trim();

  if (!estimateNumber) fieldErrors.estimate_number = "Estimate number is required";
  else if (estimateNumber.length > 64) fieldErrors.estimate_number = "Estimate number too long";

  if (!ALLOWED_ESTIMATE_STATUSES.includes(statusRaw)) fieldErrors.status = "Invalid status";

  const total = Number(totalRaw.replace(/[,$\s]/g, ""));
  if (!Number.isFinite(total) || total < 0) fieldErrors.total = "Total must be ≥ 0";
  else if (total > 1_000_000_000) fieldErrors.total = "Total is too large";

  if (clientId.length > 64) fieldErrors.client_id = "Invalid client id";
  if (projectId.length > 64) fieldErrors.project_id = "Invalid project id";

  const { items, error: itemsError } = parseLineItems(lineItemsRaw);
  if (itemsError) fieldErrors.line_items = itemsError;

  if (Object.keys(fieldErrors).length > 0) return { data: null, fieldErrors };

  return {
    data: {
      estimate_number: estimateNumber,
      status: statusRaw,
      total,
      client_id: clientId || null,
      project_id: projectId || null,
      line_items: items,
    },
    fieldErrors: {},
  };
}

export async function createEstimate(
  _prev: EstimateFormState | undefined,
  formData: FormData,
): Promise<EstimateFormState> {
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
    .from("estimates")
    .insert({ ...data, user_id: user.id })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/money/estimates");
  return { ok: true, estimateId: row?.id as string };
}

export async function updateEstimate(
  estimateId: string,
  _prev: EstimateFormState | undefined,
  formData: FormData,
): Promise<EstimateFormState> {
  if (!estimateId || estimateId.length > 64) return { ok: false, error: "Invalid estimate id" };
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
    .from("estimates")
    .update(data)
    .eq("id", estimateId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/money/estimates");
  revalidatePath(`/app/money/estimates/${estimateId}`);
  return { ok: true, estimateId };
}

export async function deleteEstimate(estimateId: string): Promise<EstimateFormState> {
  if (!estimateId || estimateId.length > 64) return { ok: false, error: "Invalid estimate id" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("estimates")
    .delete()
    .eq("id", estimateId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/money/estimates");
  return { ok: true, estimateId };
}

export async function convertEstimateToInvoice(
  estimateId: string,
): Promise<EstimateFormState> {
  if (!estimateId || estimateId.length > 64) return { ok: false, error: "Invalid estimate id" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, project_id, client_id, total, line_items, status")
    .eq("id", estimateId)
    .eq("user_id", user.id)
    .single();
  if (estErr || !estimate) return { ok: false, error: "Estimate not found" };

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      user_id: user.id,
      project_id: estimate.project_id ?? null,
      client_id: estimate.client_id ?? null,
      total: Number(estimate.total ?? 0),
      amount_paid: 0,
      status: "draft",
      line_items: estimate.line_items ?? null,
    })
    .select("id")
    .single();
  if (invErr) return { ok: false, error: invErr.message };

  await supabase
    .from("estimates")
    .update({ status: "converted" })
    .eq("id", estimateId)
    .eq("user_id", user.id);

  revalidatePath("/app/money/estimates");
  revalidatePath("/app/money/invoices");
  return { ok: true, estimateId, invoiceId: invoice?.id as string };
}
