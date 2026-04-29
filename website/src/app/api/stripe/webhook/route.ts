import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYMENT_LOG = path.join(process.cwd(), "data", "payments.json");

interface PaymentRecord {
  id: string;
  type: string;
  amount: number | null;
  currency: string | null;
  customerEmail: string | null;
  status: string | null;
  receivedAt: string;
}

async function appendPayment(record: PaymentRecord): Promise<void> {
  await fs.mkdir(path.dirname(PAYMENT_LOG), { recursive: true });
  let existing: PaymentRecord[] = [];
  try {
    const raw = await fs.readFile(PAYMENT_LOG, "utf8");
    existing = JSON.parse(raw) as PaymentRecord[];
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }
  existing.push(record);
  await fs.writeFile(PAYMENT_LOG, JSON.stringify(existing, null, 2), "utf8");
}

function verifySignature(payload: string, signatureHeader: string, secret: string): boolean {
  const parts = signatureHeader.split(",").map((p) => p.trim().split("="));
  const timestamp = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!timestamp || signatures.length === 0) return false;

  const signed = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  return signatures.some((sig) => {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (webhookSecret) {
    if (!signature || !verifySignature(payload, signature, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const obj = event.data?.object || {};
  const record: PaymentRecord = {
    id: typeof event.id === "string" ? event.id : crypto.randomUUID(),
    type: event.type || "unknown",
    amount: typeof obj.amount_total === "number" ? obj.amount_total : (typeof obj.amount === "number" ? obj.amount : null),
    currency: typeof obj.currency === "string" ? obj.currency : null,
    customerEmail:
      typeof obj.customer_email === "string"
        ? obj.customer_email
        : typeof (obj.customer_details as { email?: unknown })?.email === "string"
        ? ((obj.customer_details as { email: string }).email)
        : null,
    status: typeof obj.status === "string" ? obj.status : null,
    receivedAt: new Date().toISOString(),
  };

  await appendPayment(record);

  return NextResponse.json({ received: true });
}
