"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SUBSCRIBERS_FILE = path.join(process.cwd(), "data", "subscribers.json");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Subscriber {
  id: string;
  email: string;
  source: string | null;
  createdAt: string;
}

export interface SubscribeState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"email", string>>;
  alreadySubscribed?: boolean;
  subscriber?: Subscriber;
}

function sanitize(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

async function readAll(): Promise<Subscriber[]> {
  try {
    const raw = await fs.readFile(SUBSCRIBERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Subscriber[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: Subscriber[]): Promise<void> {
  await fs.mkdir(path.dirname(SUBSCRIBERS_FILE), { recursive: true });
  await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(items, null, 2), "utf8");
}

export async function subscribe(
  _prev: SubscribeState | undefined,
  formData: FormData,
): Promise<SubscribeState> {
  const email = sanitize(String(formData.get("email") ?? "")).toLowerCase();
  const source = sanitize(String(formData.get("source") ?? "")) || null;

  const fieldErrors: SubscribeState["fieldErrors"] = {};
  if (!email || !EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email";
  else if (email.length > 200) fieldErrors.email = "Email is too long";

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const all = await readAll();
  const existing = all.find((s) => s.email === email);
  if (existing) {
    return { ok: true, alreadySubscribed: true, subscriber: existing };
  }

  const subscriber: Subscriber = {
    id: crypto.randomUUID(),
    email,
    source,
    createdAt: new Date().toISOString(),
  };

  all.push(subscriber);
  await writeAll(all);

  return { ok: true, subscriber };
}

export async function listSubscribers(): Promise<Subscriber[]> {
  const all = await readAll();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
