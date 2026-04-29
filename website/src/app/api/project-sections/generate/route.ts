import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PhaseStub {
  name: string;
  order_index: number;
  planned_days?: number;
}

const FALLBACK_PHASES: PhaseStub[] = [
  { name: "Site prep & demolition", order_index: 0, planned_days: 5 },
  { name: "Framing & structural", order_index: 1, planned_days: 10 },
  { name: "MEP rough-in", order_index: 2, planned_days: 8 },
  { name: "Insulation & drywall", order_index: 3, planned_days: 7 },
  { name: "Finishes & paint", order_index: 4, planned_days: 9 },
  { name: "Punch list & handover", order_index: 5, planned_days: 4 },
];

export async function POST(request: NextRequest) {
  let body: { project_name?: string; project_type?: string; contract_amount?: number; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ phases: FALLBACK_PHASES, source: "stub" }, { status: 200 });
  }

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) {
    return NextResponse.json({ phases: FALLBACK_PHASES, source: "stub" }, { status: 200 });
  }

  const auth = request.headers.get("authorization") ?? "";

  try {
    const upstream = await fetch(`${backend}/api/ai/project-sections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!upstream.ok) {
      return NextResponse.json({ phases: FALLBACK_PHASES, source: "stub" }, { status: 200 });
    }
    const json = await upstream.json();
    return NextResponse.json(json, { status: 200 });
  } catch {
    return NextResponse.json({ phases: FALLBACK_PHASES, source: "stub" }, { status: 200 });
  }
}
