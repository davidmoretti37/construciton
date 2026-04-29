import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase-proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/app/:path*", "/login", "/signup", "/logout", "/api/auth/:path*"],
};
