import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set(["trialing", "active"]);

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { allowed: false, reason: "Sign in to continue." },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, owner_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "owner") {
    return NextResponse.json({
      allowed: false,
      reason: "Only owners can create projects.",
    });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, plan, current_period_end")
    .eq("owner_id", profile.id)
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json({
      allowed: false,
      reason: "Start a subscription to create projects.",
    });
  }

  const status = String(subscription.status ?? "");
  if (!ACTIVE_STATUSES.has(status)) {
    return NextResponse.json({
      allowed: false,
      reason: `Subscription is ${status || "inactive"}.`,
    });
  }

  return NextResponse.json({ allowed: true });
}
