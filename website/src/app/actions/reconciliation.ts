"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import type { BankTransactionMatchStatus } from "@/types";

const TX_FILE = path.join(process.cwd(), "data", "bank-transactions.json");

export interface StoredBankTransaction {
  id: string;
  accountId: string;
  occurredAt: string;
  description: string;
  amountCents: number;
  matchStatus: BankTransactionMatchStatus;
  matchedProjectId: string | null;
  note: string | null;
  createdAt: string;
}

export type ReconciliationFieldKey =
  | "accountId"
  | "description"
  | "amount"
  | "occurredAt"
  | "transactionId"
  | "projectId"
  | "matchStatus";

export interface ReconciliationState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<ReconciliationFieldKey, string>>;
  transaction?: StoredBankTransaction;
  transactions?: StoredBankTransaction[];
}

const MATCH_STATUSES: readonly BankTransactionMatchStatus[] = [
  "unmatched",
  "matched",
  "ignored",
  "split",
];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitize(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

async function readAll(): Promise<StoredBankTransaction[]> {
  try {
    const raw = await fs.readFile(TX_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredBankTransaction[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: StoredBankTransaction[]): Promise<void> {
  await fs.mkdir(path.dirname(TX_FILE), { recursive: true });
  await fs.writeFile(TX_FILE, JSON.stringify(items, null, 2), "utf8");
}

function sortDesc(items: StoredBankTransaction[]): StoredBankTransaction[] {
  return [...items].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function listTransactions(): Promise<StoredBankTransaction[]> {
  const all = await readAll();
  return sortDesc(all);
}

export async function recordTransaction(
  _prev: ReconciliationState | undefined,
  formData: FormData,
): Promise<ReconciliationState> {
  const accountId = sanitize(String(formData.get("accountId") ?? ""));
  const description = sanitize(String(formData.get("description") ?? ""));
  const amountRaw = sanitize(String(formData.get("amount") ?? ""));
  const occurredAt = sanitize(String(formData.get("occurredAt") ?? ""));
  const projectId = sanitize(String(formData.get("projectId") ?? "")) || null;
  const matchStatusRaw = sanitize(
    String(formData.get("matchStatus") ?? "unmatched"),
  ) as BankTransactionMatchStatus;
  const note = sanitize(String(formData.get("note") ?? "")) || null;

  const fieldErrors: ReconciliationState["fieldErrors"] = {};

  if (!accountId || accountId.length > 128) {
    fieldErrors.accountId = "Account is required";
  }
  if (!description || description.length < 2) {
    fieldErrors.description = "Description must be at least 2 characters";
  } else if (description.length > 200) {
    fieldErrors.description = "Description is too long";
  }

  let amountCents = 0;
  if (!amountRaw) {
    fieldErrors.amount = "Amount is required";
  } else {
    const num = Number(amountRaw);
    if (!Number.isFinite(num)) {
      fieldErrors.amount = "Amount must be a number";
    } else {
      amountCents = Math.round(num * 100);
    }
  }

  if (!occurredAt || !ISO_DATE_RE.test(occurredAt)) {
    fieldErrors.occurredAt = "Use YYYY-MM-DD";
  }

  if (!MATCH_STATUSES.includes(matchStatusRaw)) {
    fieldErrors.matchStatus = "Invalid match status";
  }

  if (matchStatusRaw === "matched" && !projectId) {
    fieldErrors.projectId = "Project is required when matching";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const transaction: StoredBankTransaction = {
    id: crypto.randomUUID(),
    accountId,
    occurredAt,
    description,
    amountCents,
    matchStatus: matchStatusRaw,
    matchedProjectId: matchStatusRaw === "matched" ? projectId : null,
    note,
    createdAt: new Date().toISOString(),
  };

  const all = await readAll();
  all.push(transaction);
  await writeAll(all);

  revalidatePath("/app/money/reconciliation");

  return { ok: true, transaction, transactions: sortDesc(all) };
}

async function applyStatusUpdate(
  transactionId: string,
  status: BankTransactionMatchStatus,
  matchedProjectId: string | null,
): Promise<ReconciliationState> {
  if (!transactionId) {
    return {
      ok: false,
      error: "transactionId is required",
      fieldErrors: { transactionId: "Required" },
    };
  }

  const all = await readAll();
  const idx = all.findIndex((t) => t.id === transactionId);
  if (idx === -1) {
    return { ok: false, error: "Transaction not found" };
  }

  if (status === "matched" && !matchedProjectId) {
    return {
      ok: false,
      error: "projectId is required when matching",
      fieldErrors: { projectId: "Required" },
    };
  }

  all[idx] = {
    ...all[idx],
    matchStatus: status,
    matchedProjectId: status === "matched" ? matchedProjectId : null,
  };
  await writeAll(all);

  revalidatePath("/app/money/reconciliation");

  return { ok: true, transaction: all[idx], transactions: sortDesc(all) };
}

export async function matchTransaction(
  transactionId: string,
  projectId: string,
): Promise<ReconciliationState> {
  const cleanProject = projectId?.trim();
  if (!cleanProject) {
    return {
      ok: false,
      error: "projectId is required",
      fieldErrors: { projectId: "Required" },
    };
  }
  return applyStatusUpdate(transactionId, "matched", cleanProject);
}

export async function ignoreTransaction(transactionId: string): Promise<ReconciliationState> {
  return applyStatusUpdate(transactionId, "ignored", null);
}

export async function unmatchTransaction(transactionId: string): Promise<ReconciliationState> {
  return applyStatusUpdate(transactionId, "unmatched", null);
}

export async function bulkMatchTransactions(
  transactionIds: string[],
  projectId: string,
): Promise<ReconciliationState> {
  const cleanProject = projectId?.trim();
  if (!cleanProject) {
    return {
      ok: false,
      error: "projectId is required",
      fieldErrors: { projectId: "Required" },
    };
  }
  const ids = (transactionIds ?? []).filter((id) => typeof id === "string" && id.length > 0);
  if (ids.length === 0) {
    return { ok: false, error: "Select at least one transaction" };
  }

  const all = await readAll();
  const idSet = new Set(ids);
  let updated = 0;
  for (let i = 0; i < all.length; i++) {
    if (idSet.has(all[i].id)) {
      all[i] = {
        ...all[i],
        matchStatus: "matched",
        matchedProjectId: cleanProject,
      };
      updated++;
    }
  }
  if (updated === 0) return { ok: false, error: "No matching transactions" };

  await writeAll(all);
  revalidatePath("/app/money/reconciliation");
  return { ok: true, transactions: sortDesc(all) };
}

export async function bulkIgnoreTransactions(
  transactionIds: string[],
): Promise<ReconciliationState> {
  const ids = (transactionIds ?? []).filter((id) => typeof id === "string" && id.length > 0);
  if (ids.length === 0) {
    return { ok: false, error: "Select at least one transaction" };
  }
  const all = await readAll();
  const idSet = new Set(ids);
  let updated = 0;
  for (let i = 0; i < all.length; i++) {
    if (idSet.has(all[i].id)) {
      all[i] = { ...all[i], matchStatus: "ignored", matchedProjectId: null };
      updated++;
    }
  }
  if (updated === 0) return { ok: false, error: "No matching transactions" };

  await writeAll(all);
  revalidatePath("/app/money/reconciliation");
  return { ok: true, transactions: sortDesc(all) };
}

export interface SplitInput {
  projectId: string;
  amountCents: number;
  description: string;
}

export async function splitTransaction(
  transactionId: string,
  splits: SplitInput[],
): Promise<ReconciliationState> {
  if (!transactionId) {
    return { ok: false, error: "transactionId is required" };
  }
  const cleaned = (splits ?? [])
    .map((s) => ({
      projectId: sanitize(String(s.projectId ?? "")),
      amountCents: Math.round(Number(s.amountCents) || 0),
      description: sanitize(String(s.description ?? "")),
    }))
    .filter((s) => s.projectId && s.amountCents !== 0);

  if (cleaned.length < 2) {
    return { ok: false, error: "At least two splits are required" };
  }

  const all = await readAll();
  const idx = all.findIndex((t) => t.id === transactionId);
  if (idx === -1) return { ok: false, error: "Transaction not found" };

  const total = all[idx].amountCents;
  const sum = cleaned.reduce((a, s) => a + s.amountCents, 0);
  if (Math.abs(total - sum) > 0) {
    return {
      ok: false,
      error: `Splits must sum to ${total} cents (got ${sum})`,
    };
  }

  const parent = all[idx];
  all[idx] = {
    ...parent,
    matchStatus: "split",
    matchedProjectId: cleaned[0].projectId,
  };

  for (const s of cleaned) {
    all.push({
      id: crypto.randomUUID(),
      accountId: parent.accountId,
      occurredAt: parent.occurredAt,
      description: s.description || `${parent.description} (split)`,
      amountCents: s.amountCents,
      matchStatus: "matched",
      matchedProjectId: s.projectId,
      note: `split of ${parent.id}`,
      createdAt: new Date().toISOString(),
    });
  }

  await writeAll(all);
  revalidatePath("/app/money/reconciliation");
  return { ok: true, transactions: sortDesc(all) };
}
