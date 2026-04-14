"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { fetchDashboardData, type DashboardData } from "@/services/dashboard";

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Always create a fresh client so it reads the latest token from localStorage
      const supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: true, autoRefreshToken: true } }
      );

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setError("Please sign in");
        setLoading(false);
        return;
      }

      const result = await fetchDashboardData(supabase, session.user.id);
      setData(result);
    } catch (e) {
      console.error("[Dashboard]", e);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
