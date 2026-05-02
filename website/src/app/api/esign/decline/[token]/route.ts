/** Same-origin proxy for the public e-sign decline endpoint (companion to /sign/[token]). */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!BACKEND_URL) {
    return new Response(JSON.stringify({ error: "Backend URL not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const body = await req.text();
  const res = await fetch(`${BACKEND_URL}/api/esign/decline/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
  });
}
