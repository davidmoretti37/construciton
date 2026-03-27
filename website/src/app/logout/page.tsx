"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function LogoutPage() {
  useEffect(() => {
    async function logout() {
      const supabase = createClient();
      await supabase.auth.signOut();
      // Clear all cookies manually
      document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      // Clear localStorage
      localStorage.clear();
      window.location.href = "/login";
    }
    logout();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm text-gray-400">Signing out...</p>
    </div>
  );
}
