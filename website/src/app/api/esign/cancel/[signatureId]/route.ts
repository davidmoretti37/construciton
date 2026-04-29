import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxyToRailway(
  signatureId: string,
  authHeader: string | null,
): Promise<NextResponse | null> {
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) return null;
  try {
    const upstream = await fetch(
      `${backend}/api/esign/cancel/${encodeURIComponent(signatureId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
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
  { params }: { params: Promise<{ signatureId: string }> },
) {
  const { signatureId } = await params;
  if (!signatureId || signatureId.length > 64) {
    return NextResponse.json({ error: "Invalid signature id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing, error: lookupErr } = await supabase
    .from("signatures")
    .select("id, status, user_id, document_id, document_type")
    .eq("id", signatureId)
    .maybeSingle();

  if (lookupErr || !existing) {
    return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  }
  if (existing.user_id && existing.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.status === "signed") {
    return NextResponse.json({ error: "Cannot cancel a signed document" }, { status: 409 });
  }

  const proxied = await proxyToRailway(
    signatureId,
    request.headers.get("authorization"),
  );
  if (proxied) return proxied;

  const { error } = await supabase
    .from("signatures")
    .update({ status: "expired" })
    .eq("id", signatureId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, signatureId });
}
