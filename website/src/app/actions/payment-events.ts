"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { DbPaymentEvent } from "@/types/database";
import { safe } from "@/lib/safe";

const ALLOWED_KINDS = ["payment", "refund", "adjustment"] as const;
type PaymentKind = (typeof ALLOWED_KINDS)[number];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type PaymentFieldKey =
  | "amount"
  | "kind"
  | "occurred_at"
  | "note"
  | "invoice_id"
  | "auth";

export interface PaymentEventState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<PaymentFieldKey, string>>;
  paymentId?: string;
  events?: DbPaymentEvent[];
}

function sanitize(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

interface PaymentInput {
  invoice_id: string;
  amount: number;
  kind: PaymentKind;
  occurred_at: string;
  note: string | null;
}

function parseAndValidate(formData: FormData): {
  data: PaymentInput | null;
  fieldErrors: PaymentEventState["fieldErrors"];
} {
  const fieldErrors: PaymentEventState["fieldErrors"] = {};

  const invoiceId = sanitize(String(formData.get("invoice_id") ?? ""));
  const amountRaw = sanitize(String(formData.get("amount") ?? "0"));
  const kindRaw = sanitize(String(formData.get("kind") ?? "payment")) as PaymentKind;
  const occurredAt = sanitize(String(formData.get("occurred_at") ?? ""));
  const note = sanitize(String(formData.get("note") ?? ""));

  if (!invoiceId || invoiceId.length > 64) fieldErrors.invoice_id = "Invalid invoice id";
  if (!ALLOWED_KINDS.includes(kindRaw)) fieldErrors.kind = "Invalid event kind";

  const amount = Number(amountRaw.replace(/[,$\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) fieldErrors.amount = "Amount must be > 0";
  else if (amount > 1_000_000_000) fieldErrors.amount = "Amount is too large";

  if (occurredAt && !ISO_DATE_RE.test(occurredAt))
    fieldErrors.occurred_at = "Use YYYY-MM-DD";

  if (note.length > 1000) fieldErrors.note = "Note is too long (max 1000)";

  if (Object.keys(fieldErrors).length > 0) return { data: null, fieldErrors };

  return {
    data: {
      invoice_id: invoiceId,
      amount,
      kind: kindRaw,
      occurred_at: occurredAt || new Date().toISOString().slice(0, 10),
      note: note || null,
    },
    fieldErrors: {},
  };
}

export async function recordPaymentEvent(
  _prev: PaymentEventState | undefined,
  formData: FormData,
): Promise<PaymentEventState> {
  const { data, fieldErrors } = parseAndValidate(formData);
  if (!data) return { ok: false, error: "Validation failed", fieldErrors };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated", fieldErrors: { auth: "Please sign in" } };
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, total, amount_paid, status, user_id")
    .eq("id", data.invoice_id)
    .eq("user_id", user.id)
    .single();

  if (invErr || !invoice) {
    return { ok: false, error: "Invoice not found", fieldErrors: { invoice_id: "Not found" } };
  }

  const { data: row, error } = await supabase
    .from("payment_events")
    .insert({
      invoice_id: data.invoice_id,
      amount: data.amount,
      kind: data.kind,
      occurred_at: data.occurred_at,
      note: data.note,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const delta = data.kind === "refund" ? -data.amount : data.amount;
  const newPaid = Math.max(0, Number(invoice.amount_paid ?? 0) + delta);
  const total = Number(invoice.total ?? 0);
  const newStatus =
    newPaid >= total && total > 0
      ? "paid"
      : newPaid > 0
        ? "partial"
        : (invoice.status as string) || "draft";

  await supabase
    .from("invoices")
    .update({
      amount_paid: newPaid,
      status: newStatus,
      paid_at: newStatus === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", data.invoice_id)
    .eq("user_id", user.id);

  revalidatePath("/app/money/invoices");
  revalidatePath(`/app/money/invoices/${data.invoice_id}`);

  const events = await listPaymentEvents(data.invoice_id);
  return { ok: true, paymentId: row?.id as string, events };
}

export async function listPaymentEvents(invoiceId: string): Promise<DbPaymentEvent[]> {
  if (!invoiceId || invoiceId.length > 64) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .single();
  if (!invoice) return [];

  return safe<DbPaymentEvent[]>(
    "payment_events.list",
    supabase
      .from("payment_events")
      .select("id, invoice_id, amount, kind, occurred_at, note, created_at")
      .eq("invoice_id", invoiceId)
      .order("occurred_at", { ascending: false })
      .limit(200),
    [],
  );
}

export async function deletePaymentEvent(
  paymentId: string,
  invoiceId: string,
): Promise<PaymentEventState> {
  if (!paymentId || paymentId.length > 64) return { ok: false, error: "Invalid payment id" };
  if (!invoiceId || invoiceId.length > 64) return { ok: false, error: "Invalid invoice id" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, total, amount_paid")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .single();
  if (!invoice) return { ok: false, error: "Invoice not found" };

  const { data: removed, error: getErr } = await supabase
    .from("payment_events")
    .select("amount, kind")
    .eq("id", paymentId)
    .eq("invoice_id", invoiceId)
    .single();
  if (getErr || !removed) return { ok: false, error: "Payment event not found" };

  const { error } = await supabase
    .from("payment_events")
    .delete()
    .eq("id", paymentId)
    .eq("invoice_id", invoiceId);
  if (error) return { ok: false, error: error.message };

  const reverseDelta =
    removed.kind === "refund" ? Number(removed.amount) : -Number(removed.amount);
  const newPaid = Math.max(0, Number(invoice.amount_paid ?? 0) + reverseDelta);
  const total = Number(invoice.total ?? 0);
  const newStatus = newPaid >= total && total > 0 ? "paid" : newPaid > 0 ? "partial" : "sent";

  await supabase
    .from("invoices")
    .update({ amount_paid: newPaid, status: newStatus })
    .eq("id", invoiceId)
    .eq("user_id", user.id);

  revalidatePath(`/app/money/invoices/${invoiceId}`);
  const events = await listPaymentEvents(invoiceId);
  return { ok: true, events };
}
