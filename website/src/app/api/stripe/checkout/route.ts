import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CheckoutBody {
  priceId?: string;
  amount?: number;
  currency?: string;
  productName?: string;
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  mode?: "payment" | "subscription";
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "Stripe is not configured. Set STRIPE_SECRET_KEY." },
      { status: 503 }
    );
  }

  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const origin = request.nextUrl.origin;
  const successUrl =
    body.successUrl || `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = body.cancelUrl || `${origin}/checkout/cancel`;
  const mode: "payment" | "subscription" = body.mode === "subscription" ? "subscription" : "payment";

  const params = new URLSearchParams();
  params.append("mode", mode);
  params.append("success_url", successUrl);
  params.append("cancel_url", cancelUrl);

  if (body.customerEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customerEmail)) {
      return badRequest("Invalid customerEmail");
    }
    params.append("customer_email", body.customerEmail);
  }

  if (body.priceId) {
    params.append("line_items[0][price]", body.priceId);
    params.append("line_items[0][quantity]", "1");
  } else if (typeof body.amount === "number" && body.amount > 0) {
    const currency = (body.currency || "usd").toLowerCase();
    const productName = body.productName || "Custom Charge";
    params.append("line_items[0][quantity]", "1");
    params.append("line_items[0][price_data][currency]", currency);
    params.append("line_items[0][price_data][unit_amount]", String(Math.round(body.amount)));
    params.append("line_items[0][price_data][product_data][name]", productName);
  } else {
    return badRequest("Provide either priceId or a positive amount");
  }

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = (await stripeRes.json()) as { id?: string; url?: string; error?: { message?: string } };

  if (!stripeRes.ok) {
    return NextResponse.json(
      { error: data.error?.message || "Stripe error" },
      { status: stripeRes.status }
    );
  }

  return NextResponse.json({ id: data.id, url: data.url });
}
