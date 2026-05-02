/**
 * Same-origin proxy for the public e-sign endpoints.
 *
 * The /sign/<token> page is loaded inside a mobile WebView (and as a regular
 * web page from email links). The token in the URL is the only auth, so the
 * client doesn't have a Supabase session. To avoid cross-origin fetch issues
 * (NEXT_PUBLIC_BACKEND_URL not set in browser bundle, CORS, simulator
 * networking quirks), the SignClient POSTs to this same-origin route and we
 * proxy through to the real backend server-side.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "";

export const dynamic = "force-dynamic";

async function proxy(method: "GET" | "POST", token: string, body?: string) {
  if (!BACKEND_URL) {
    return new Response(JSON.stringify({ error: "Backend URL not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const res = await fetch(`${BACKEND_URL}/api/esign/sign/${encodeURIComponent(token)}`, {
    method,
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

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return proxy("GET", token);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.text();
  return proxy("POST", token, body);
}
