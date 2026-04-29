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
      `${backend}/api/esign/status/${encodeURIComponent(signatureId)}`,
      {
        method: "GET",
        headers: {
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

export async function GET(
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

  const proxied = await proxyToRailway(
    signatureId,
    request.headers.get("authorization"),
  );
  if (proxied) return proxied;

  const { data, error } = await supabase
    .from("signatures")
    .select(
      "id, document_id, document_type, status, signer_email, signer_name, expires_at, signed_at, signature_png_url, user_id, created_at",
    )
    .eq("id", signatureId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  }
  if (data.user_id && data.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ signature: data });
}
