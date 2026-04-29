"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { DbInvoiceLineItem } from "@/types/database";

const ALLOWED_INVOICE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "paid",
  "partial",
  "overdue",
  "void",
] as const;
type InvoiceStatus = (typeof ALLOWED_INVOICE_STATUSES)[number];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KPI_RANGES = ["all", "7d", "30d", "90d", "ytd"] as const;
type KpiRange = (typeof KPI_RANGES)[number];

type InvoiceFieldKey =
  | "invoice_number"
  | "status"
  | "total"
  | "amount_paid"
  | "issued_at"
  | "due_date"
  | "client_id"
  | "project_id"
  | "line_items"
  | "auth";

export interface InvoiceFormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<InvoiceFieldKey, string>>;
  invoiceId?: string;
}

interface InvoiceInput {
  invoice_number: string | null;
  status: InvoiceStatus;
  total: number;
  amount_paid: number;
  issued_at: string | null;
  due_date: string | null;
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
  if (!Array.isArray(parsed)) {
    return { items: null, error: "Line items must be an array" };
  }
  if (parsed.length > 200) {
    return { items: null, error: "Too many line items (max 200)" };
  }

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
  data: InvoiceInput | null;
  fieldErrors: InvoiceFormState["fieldErrors"];
} {
  const fieldErrors: InvoiceFormState["fieldErrors"] = {};

  const invoiceNumber = sanitize(String(formData.get("invoice_number") ?? ""));
  const statusRaw = sanitize(String(formData.get("status") ?? "draft")) as InvoiceStatus;
  const totalRaw = sanitize(String(formData.get("total") ?? "0"));
  const paidRaw = sanitize(String(formData.get("amount_paid") ?? "0"));
  const issuedAt = sanitize(String(formData.get("issued_at") ?? ""));
  const dueDate = sanitize(String(formData.get("due_date") ?? ""));
  const clientId = sanitize(String(formData.get("client_id") ?? ""));
  const projectId = sanitize(String(formData.get("project_id") ?? ""));
  const lineItemsRaw = String(formData.get("line_items") ?? "").trim();

  if (invoiceNumber.length > 64) fieldErrors.invoice_number = "Invoice number too long";

  if (!ALLOWED_INVOICE_STATUSES.includes(statusRaw)) fieldErrors.status = "Invalid status";

  const total = Number(totalRaw.replace(/[,$\s]/g, ""));
  if (!Number.isFinite(total) || total < 0) fieldErrors.total = "Total must be ≥ 0";
  else if (total > 1_000_000_000) fieldErrors.total = "Total is too large";

  const amountPaid = Number(paidRaw.replace(/[,$\s]/g, ""));
  if (!Number.isFinite(amountPaid) || amountPaid < 0)
    fieldErrors.amount_paid = "Amount paid must be ≥ 0";
  else if (amountPaid > total + 0.001)
    fieldErrors.amount_paid = "Amount paid cannot exceed total";

  if (issuedAt && !ISO_DATE_RE.test(issuedAt)) fieldErrors.issued_at = "Use YYYY-MM-DD";
  if (dueDate && !ISO_DATE_RE.test(dueDate)) fieldErrors.due_date = "Use YYYY-MM-DD";
  if (issuedAt && dueDate && issuedAt > dueDate)
    fieldErrors.due_date = "Due date must be on or after issued date";

  if (clientId.length > 64) fieldErrors.client_id = "Invalid client id";
  if (projectId.length > 64) fieldErrors.project_id = "Invalid project id";

  const { items, error: itemsError } = parseLineItems(lineItemsRaw);
  if (itemsError) fieldErrors.line_items = itemsError;

  if (Object.keys(fieldErrors).length > 0) return { data: null, fieldErrors };

  return {
    data: {
      invoice_number: invoiceNumber || null,
      status: statusRaw,
      total,
      amount_paid: amountPaid,
      issued_at: issuedAt || null,
      due_date: dueDate || null,
      client_id: clientId || null,
      project_id: projectId || null,
      line_items: items,
    },
    fieldErrors: {},
  };
}

export async function createInvoice(
  _prev: InvoiceFormState | undefined,
  formData: FormData,
): Promise<InvoiceFormState> {
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
    .from("invoices")
    .insert({ ...data, user_id: user.id })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/money/invoices");
  revalidatePath("/app/money");
  return { ok: true, invoiceId: row?.id as string };
}

export async function updateInvoice(
  invoiceId: string,
  _prev: InvoiceFormState | undefined,
  formData: FormData,
): Promise<InvoiceFormState> {
  if (!invoiceId || invoiceId.length > 64) return { ok: false, error: "Invalid invoice id" };
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
    .from("invoices")
    .update(data)
    .eq("id", invoiceId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/money/invoices");
  revalidatePath(`/app/money/invoices/${invoiceId}`);
  return { ok: true, invoiceId };
}

export async function deleteInvoice(invoiceId: string): Promise<InvoiceFormState> {
  if (!invoiceId || invoiceId.length > 64) return { ok: false, error: "Invalid invoice id" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", invoiceId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/money/invoices");
  return { ok: true, invoiceId };
}

export interface InvoiceKpiState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"range" | "status", string>>;
  range: KpiRange;
  status: "all" | InvoiceStatus;
  totals: {
    count: number;
    issued: number;
    collected: number;
    outstanding: number;
    overdue: number;
  };
}

const EMPTY_TOTALS = { count: 0, issued: 0, collected: 0, outstanding: 0, overdue: 0 };

function rangeStart(range: KpiRange): string | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "ytd") {
    return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
  }
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const dt = new Date(now.getTime() - days * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

export async function loadInvoiceKpis(
  _prev: InvoiceKpiState | undefined,
  formData: FormData,
): Promise<InvoiceKpiState> {
  const rangeRaw = sanitize(String(formData.get("range") ?? "30d")) as KpiRange;
  const statusRaw = sanitize(String(formData.get("status") ?? "all"));

  const fieldErrors: InvoiceKpiState["fieldErrors"] = {};
  if (!KPI_RANGES.includes(rangeRaw)) fieldErrors.range = "Invalid range";
  const isStatusValid =
    statusRaw === "all" || ALLOWED_INVOICE_STATUSES.includes(statusRaw as InvoiceStatus);
  if (!isStatusValid) fieldErrors.status = "Invalid status";

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors,
      range: rangeRaw,
      status: statusRaw as InvoiceKpiState["status"],
      totals: EMPTY_TOTALS,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Not authenticated",
      range: rangeRaw,
      status: statusRaw as InvoiceKpiState["status"],
      totals: EMPTY_TOTALS,
    };
  }

  let query = supabase
    .from("invoices")
    .select("total, amount_paid, status, issued_at, due_date")
    .eq("user_id", user.id)
    .limit(2000);

  const start = rangeStart(rangeRaw);
  if (start) query = query.gte("issued_at", start);
  if (statusRaw !== "all") query = query.eq("status", statusRaw);

  const { data, error } = await query;
  if (error) {
    return {
      ok: false,
      error: error.message,
      range: rangeRaw,
      status: statusRaw as InvoiceKpiState["status"],
      totals: EMPTY_TOTALS,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const totals = (data ?? []).reduce(
    (acc, row) => {
      const total = Number(row.total ?? 0);
      const paid = Number(row.amount_paid ?? 0);
      acc.count += 1;
      acc.issued += total;
      acc.collected += paid;
      acc.outstanding += Math.max(total - paid, 0);
      const due = (row.due_date as string | null) ?? null;
      const status = (row.status as string) ?? "";
      if (due && due < today && status !== "paid" && status !== "void") {
        acc.overdue += Math.max(total - paid, 0);
      }
      return acc;
    },
    { ...EMPTY_TOTALS },
  );

  return {
    ok: true,
    range: rangeRaw,
    status: statusRaw as InvoiceKpiState["status"],
    totals,
  };
}

export interface InvoiceListState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"q" | "status", string>>;
  query: string;
  status: "all" | InvoiceStatus;
  results: Array<{
    id: string;
    invoice_number: string | null;
    status: string;
    total: number;
    amount_paid: number;
    issued_at: string | null;
    due_date: string | null;
    client_id: string | null;
    project_id: string | null;
  }>;
}

export async function searchInvoices(
  _prev: InvoiceListState | undefined,
  formData: FormData,
): Promise<InvoiceListState> {
  const q = sanitize(String(formData.get("q") ?? ""));
  const statusRaw = sanitize(String(formData.get("status") ?? "all"));

  const fieldErrors: InvoiceListState["fieldErrors"] = {};
  if (q.length > 200) fieldErrors.q = "Search is too long";
  const isStatusValid =
    statusRaw === "all" || ALLOWED_INVOICE_STATUSES.includes(statusRaw as InvoiceStatus);
  if (!isStatusValid) fieldErrors.status = "Invalid status";

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors,
      query: q,
      status: statusRaw as InvoiceListState["status"],
      results: [],
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Not authenticated",
      query: q,
      status: statusRaw as InvoiceListState["status"],
      results: [],
    };
  }

  let query = supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, total, amount_paid, issued_at, due_date, client_id, project_id, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (statusRaw !== "all") query = query.eq("status", statusRaw);
  if (q) {
    const escaped = q.replace(/[%,]/g, "");
    query = query.ilike("invoice_number", `%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) {
    return {
      ok: false,
      error: error.message,
      query: q,
      status: statusRaw as InvoiceListState["status"],
      results: [],
    };
  }

  return {
    ok: true,
    query: q,
    status: statusRaw as InvoiceListState["status"],
    results: (data ?? []).map((r) => ({
      id: r.id as string,
      invoice_number: (r.invoice_number as string | null) ?? null,
      status: (r.status as string) ?? "draft",
      total: Number(r.total ?? 0),
      amount_paid: Number(r.amount_paid ?? 0),
      issued_at: (r.issued_at as string | null) ?? null,
      due_date: (r.due_date as string | null) ?? null,
      client_id: (r.client_id as string | null) ?? null,
      project_id: (r.project_id as string | null) ?? null,
    })),
  };
}

export interface SendInvoiceState {
  ok: boolean;
  error?: string;
  invoiceId?: string;
}

export async function sendInvoice(
  invoiceId: string,
  _prev: SendInvoiceState | undefined,
  formData: FormData,
): Promise<SendInvoiceState> {
  if (!invoiceId || invoiceId.length > 64) return { ok: false, error: "Invalid invoice id" };
  const recipient = sanitize(String(formData.get("recipient_email") ?? "")).toLowerCase();
  const message = sanitize(String(formData.get("message") ?? ""));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { ok: false, error: "Enter a valid recipient email" };
  }
  if (message.length > 5000) return { ok: false, error: "Message is too long" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("invoices")
    .update({ status: "sent", issued_at: new Date().toISOString().slice(0, 10) })
    .eq("id", invoiceId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/money/invoices");
  revalidatePath(`/app/money/invoices/${invoiceId}`);
  return { ok: true, invoiceId };
}
