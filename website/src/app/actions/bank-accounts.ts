"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import type { BankAccountProvider } from "@/types";

const BANK_ACCOUNTS_FILE = path.join(process.cwd(), "data", "bank-accounts.json");

export interface StoredBankAccount {
  id: string;
  provider: BankAccountProvider;
  bankName: string;
  accountMask: string;
  balanceCents: number;
  currency: string;
  enrollmentId: string;
  lastSyncedAt: string | null;
  createdAt: string;
}

export type BankAccountFieldKey =
  | "bankName"
  | "accountMask"
  | "balance"
  | "currency"
  | "provider";

export interface BankAccountState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<BankAccountFieldKey, string>>;
  account?: StoredBankAccount;
  accounts?: StoredBankAccount[];
}

const PROVIDERS: readonly BankAccountProvider[] = ["teller", "plaid"];
const ACCOUNT_MASK_RE = /^\d{4}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

function sanitize(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

async function readAll(): Promise<StoredBankAccount[]> {
  try {
    const raw = await fs.readFile(BANK_ACCOUNTS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredBankAccount[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: StoredBankAccount[]): Promise<void> {
  await fs.mkdir(path.dirname(BANK_ACCOUNTS_FILE), { recursive: true });
  await fs.writeFile(BANK_ACCOUNTS_FILE, JSON.stringify(items, null, 2), "utf8");
}

export async function listBankAccounts(): Promise<StoredBankAccount[]> {
  const all = await readAll();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function connectBankAccount(
  _prev: BankAccountState | undefined,
  formData: FormData,
): Promise<BankAccountState> {
  const providerRaw = sanitize(String(formData.get("provider") ?? "teller")) as BankAccountProvider;
  const bankName = sanitize(String(formData.get("bankName") ?? ""));
  const accountMask = sanitize(String(formData.get("accountMask") ?? ""));
  const currencyRaw = sanitize(String(formData.get("currency") ?? "USD")).toUpperCase();
  const balanceRaw = sanitize(String(formData.get("balance") ?? ""));

  const fieldErrors: BankAccountState["fieldErrors"] = {};

  if (!PROVIDERS.includes(providerRaw)) {
    fieldErrors.provider = "Provider must be teller or plaid";
  }

  if (!bankName || bankName.length < 2) {
    fieldErrors.bankName = "Bank name must be at least 2 characters";
  } else if (bankName.length > 80) {
    fieldErrors.bankName = "Bank name is too long";
  }

  if (!accountMask || !ACCOUNT_MASK_RE.test(accountMask)) {
    fieldErrors.accountMask = "Last 4 digits must be 4 numbers";
  }

  if (!CURRENCY_RE.test(currencyRaw)) {
    fieldErrors.currency = "Currency must be a 3-letter ISO code";
  }

  let balanceCents = 0;
  if (balanceRaw) {
    const parsed = Number(balanceRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      fieldErrors.balance = "Balance must be a non-negative number";
    } else {
      balanceCents = Math.round(parsed * 100);
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const all = await readAll();
  const duplicate = all.find(
    (a) => a.bankName.toLowerCase() === bankName.toLowerCase() && a.accountMask === accountMask,
  );
  if (duplicate) {
    return {
      ok: false,
      error: `${bankName} •••• ${accountMask} is already connected`,
    };
  }

  const account: StoredBankAccount = {
    id: crypto.randomUUID(),
    provider: providerRaw,
    bankName,
    accountMask,
    balanceCents,
    currency: currencyRaw,
    enrollmentId: `enr_${crypto.randomBytes(8).toString("hex")}`,
    lastSyncedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  all.push(account);
  await writeAll(all);

  revalidatePath("/app/money/bank");

  const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true, account, accounts: sorted };
}

export async function syncBankAccount(accountId: string): Promise<BankAccountState> {
  if (!accountId) {
    return { ok: false, error: "accountId is required" };
  }
  const all = await readAll();
  const idx = all.findIndex((a) => a.id === accountId);
  if (idx === -1) {
    return { ok: false, error: "Account not found" };
  }
  all[idx] = { ...all[idx], lastSyncedAt: new Date().toISOString() };
  await writeAll(all);

  revalidatePath("/app/money/bank");

  const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true, account: all[idx], accounts: sorted };
}

export async function disconnectBankAccount(accountId: string): Promise<BankAccountState> {
  if (!accountId) {
    return { ok: false, error: "accountId is required" };
  }
  const all = await readAll();
  const exists = all.some((a) => a.id === accountId);
  if (!exists) {
    return { ok: false, error: "Account not found" };
  }
  const next = all.filter((a) => a.id !== accountId);
  await writeAll(next);

  revalidatePath("/app/money/bank");

  const sorted = [...next].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true, accounts: sorted };
}
