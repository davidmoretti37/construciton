"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";

const COMMENTS_FILE = path.join(process.cwd(), "data", "comments.json");

export interface Comment {
  id: string;
  targetId: string;
  authorName: string;
  authorEmail: string | null;
  body: string;
  rating: number | null;
  createdAt: string;
}

export interface CommentResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"authorName" | "authorEmail" | "body" | "rating" | "targetId", string>>;
  comments?: Comment[];
  comment?: Comment;
}

async function readAll(): Promise<Comment[]> {
  try {
    const raw = await fs.readFile(COMMENTS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Comment[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: Comment[]): Promise<void> {
  await fs.mkdir(path.dirname(COMMENTS_FILE), { recursive: true });
  await fs.writeFile(COMMENTS_FILE, JSON.stringify(items, null, 2), "utf8");
}

function sanitize(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

export async function listComments(targetId: string): Promise<Comment[]> {
  const all = await readAll();
  return all
    .filter((c) => c.targetId === targetId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createComment(formData: FormData): Promise<CommentResult> {
  const targetId = sanitize(String(formData.get("targetId") ?? ""));
  const authorName = sanitize(String(formData.get("authorName") ?? ""));
  const authorEmailRaw = sanitize(String(formData.get("authorEmail") ?? ""));
  const body = sanitize(String(formData.get("body") ?? ""));
  const ratingRaw = String(formData.get("rating") ?? "").trim();

  const fieldErrors: CommentResult["fieldErrors"] = {};

  if (!targetId || targetId.length > 128) {
    fieldErrors.targetId = "Invalid target";
  }
  if (!authorName || authorName.length < 2) {
    fieldErrors.authorName = "Name must be at least 2 characters";
  } else if (authorName.length > 80) {
    fieldErrors.authorName = "Name is too long";
  }
  if (authorEmailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmailRaw)) {
    fieldErrors.authorEmail = "Invalid email";
  }
  if (!body || body.length < 3) {
    fieldErrors.body = "Comment must be at least 3 characters";
  } else if (body.length > 2000) {
    fieldErrors.body = "Comment is too long (max 2000 chars)";
  }

  let rating: number | null = null;
  if (ratingRaw) {
    const n = Number(ratingRaw);
    if (!Number.isFinite(n) || n < 1 || n > 5 || !Number.isInteger(n)) {
      fieldErrors.rating = "Rating must be 1–5";
    } else {
      rating = n;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const comment: Comment = {
    id: crypto.randomUUID(),
    targetId,
    authorName,
    authorEmail: authorEmailRaw || null,
    body,
    rating,
    createdAt: new Date().toISOString(),
  };

  const all = await readAll();
  all.push(comment);
  await writeAll(all);

  revalidatePath("/");

  const updated = all
    .filter((c) => c.targetId === targetId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { ok: true, comments: updated, comment };
}

export async function deleteComment(id: string, targetId: string): Promise<CommentResult> {
  if (!id || !targetId) {
    return { ok: false, error: "id and targetId required" };
  }
  const all = await readAll();
  const next = all.filter((c) => c.id !== id);
  await writeAll(next);

  const updated = next
    .filter((c) => c.targetId === targetId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { ok: true, comments: updated };
}
