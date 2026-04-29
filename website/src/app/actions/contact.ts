"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SUBMISSIONS_FILE = path.join(process.cwd(), "data", "submissions.json");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  message: string;
  emailSent: boolean;
  createdAt: string;
}

export interface ContactState {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "message", string>>;
  submission?: ContactSubmission;
}

function sanitize(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

async function readAll(): Promise<ContactSubmission[]> {
  try {
    const raw = await fs.readFile(SUBMISSIONS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ContactSubmission[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: ContactSubmission[]): Promise<void> {
  await fs.mkdir(path.dirname(SUBMISSIONS_FILE), { recursive: true });
  await fs.writeFile(SUBMISSIONS_FILE, JSON.stringify(items, null, 2), "utf8");
}

async function sendEmail(payload: {
  name: string;
  email: string;
  message: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.RESEND_FROM || "Sylk <onboarding@resend.dev>";
  const to = process.env.CONTACT_INBOX || "support@sylkapp.ai";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        reply_to: payload.email,
        subject: `New contact form message from ${payload.name}`,
        text: `From: ${payload.name} <${payload.email}>\n\n${payload.message}`,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[contact] Resend send failed:", err);
    return false;
  }
}

export async function submitContact(
  _prev: ContactState | undefined,
  formData: FormData,
): Promise<ContactState> {
  const name = sanitize(String(formData.get("name") ?? ""));
  const email = sanitize(String(formData.get("email") ?? "")).toLowerCase();
  const message = sanitize(String(formData.get("message") ?? ""));

  const fieldErrors: ContactState["fieldErrors"] = {};
  if (!name || name.length < 2) fieldErrors.name = "Name must be at least 2 characters";
  else if (name.length > 80) fieldErrors.name = "Name is too long";

  if (!email || !EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email";
  else if (email.length > 200) fieldErrors.email = "Email is too long";

  if (!message || message.length < 10)
    fieldErrors.message = "Message must be at least 10 characters";
  else if (message.length > 5000)
    fieldErrors.message = "Message is too long (max 5000 chars)";

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const emailSent = await sendEmail({ name, email, message });

  const submission: ContactSubmission = {
    id: crypto.randomUUID(),
    name,
    email,
    message,
    emailSent,
    createdAt: new Date().toISOString(),
  };

  const all = await readAll();
  all.push(submission);
  await writeAll(all);

  return { ok: true, submission };
}

export async function listContactSubmissions(): Promise<ContactSubmission[]> {
  const all = await readAll();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
