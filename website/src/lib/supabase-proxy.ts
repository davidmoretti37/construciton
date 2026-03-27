import { NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
  // Simple pass-through — auth is handled client-side via localStorage now.
  // The proxy only exists to set security headers and handle future server-side needs.
  // Client-side AuthContext + useDashboard handle auth checks and redirects.
  return NextResponse.next({ request });
}
