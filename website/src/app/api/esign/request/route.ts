import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["invoice", "estimate", "contract"] as const;
type DocumentType = (typeof ALLOWED_TYPES)[number];

interface RequestBody {
  documentType?: string;
  documentId?: string;
  signerName?: string;
  signerEmail?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitize(value: string, max = 200): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

async function proxyToRailway(
  body: RequestBody,
  authHeader: string | null,
): Promise<NextResponse | null> {
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) return null;
  try {
    const upstream = await fetch(`${backend}/api/esign/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    const json = text ? JSON.parse(text) : {};
    return NextResponse.json(json, { status: upstream.status });
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const documentType = sanitize(String(body.documentType ?? ""), 32) as DocumentType;
  const documentId = sanitize(String(body.documentId ?? ""), 64);
  const signerEmail = sanitize(String(body.signerEmail ?? ""), 254).toLowerCase();
  const signerName = sanitize(String(body.signerName ?? ""), 200);

  if (!ALLOWED_TYPES.includes(documentType)) {
    return NextResponse.json(
      { error: "documentType must be invoice, estimate, or contract" },
      { status: 400 },
    );
  }
  if (!documentId) {
    return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  }
  if (!EMAIL_RE.test(signerEmail)) {
    return NextResponse.json({ error: "signerEmail is invalid" }, { status: 400 });
  }
  if (!signerName) {
    return NextResponse.json({ error: "signerName is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (documentType !== "contract") {
    const table = documentType === "invoice" ? "invoices" : "estimates";
    const { data: doc, error: docErr } = await supabase
      .from(table)
      .select("id")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (docErr || !doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
  } else {
    const { data: doc } = await supabase
      .from("contracts")
      .select("id")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
  }

  const proxied = await proxyToRailway(
    { documentType, documentId, signerEmail, signerName },
    request.headers.get("authorization"),
  );
  if (proxied) return proxied;

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const origin = request.nextUrl.origin;

  const { data: row, error } = await supabase
    .from("signatures")
    .insert({
      document_id: documentId,
      document_type: documentType,
      status: "pending",
      signer_email: signerEmail,
      signer_name: signerName,
      token,
      expires_at: expiresAt,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to create signature request" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    signatureId: row?.id,
    token,
    signUrl: `${origin}/sign/${token}`,
    expiresAt,
  });
}
