import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["invoices", "estimates", "contracts"] as const;
type DocumentType = (typeof ALLOWED_TYPES)[number];

interface SendBody {
  email?: string;
  subject?: string;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitize(value: string, max = 5000): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

async function proxyToRailway(
  type: DocumentType,
  id: string,
  body: SendBody,
  authHeader: string | null,
): Promise<NextResponse | null> {
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) return null;
  try {
    const upstream = await fetch(
      `${backend}/api/portal-admin/${type}/${encodeURIComponent(id)}/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify(body),
      },
    );
    const text = await upstream.text();
    const json = text ? JSON.parse(text) : {};
    return NextResponse.json(json, { status: upstream.status });
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type: typeRaw, id } = await params;
  const type = typeRaw as DocumentType;

  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json(
      { error: "Type must be invoices, estimates, or contracts" },
      { status: 400 },
    );
  }
  if (!id || id.length > 64) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }

  let raw: SendBody;
  try {
    raw = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = sanitize(String(raw.email ?? ""), 254).toLowerCase();
  const subject = sanitize(String(raw.subject ?? ""), 200);
  const message = sanitize(String(raw.message ?? ""), 5000);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Recipient email is invalid" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: doc, error: lookupErr } = await supabase
    .from(type)
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupErr || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const proxied = await proxyToRailway(
    type,
    id,
    { email, subject, message },
    request.headers.get("authorization"),
  );
  if (proxied) return proxied;

  const updates: Record<string, string> = { status: "sent" };
  if (type === "invoices") {
    updates.issued_at = new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase
    .from(type)
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, status: "sent", recipient: email });
}
