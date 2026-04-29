"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useAuth } from "@/contexts/AuthContext";
import type { DbEstimate, DbSignature } from "@/types/database";

interface State {
  estimates: DbEstimate[];
  signatures: Record<string, DbSignature>;
  loading: boolean;
  error: string | null;
}

export function useEstimates() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({
    estimates: [],
    signatures: {},
    loading: true,
    error: null,
  });
  const mounted = useRef(true);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setState({ estimates: [], signatures: {}, loading: false, error: null });
      return;
    }
    const supabase = createClient();
    const [{ data: estimates, error }, sigs] = await Promise.all([
      supabase
        .from("estimates")
        .select(
          "id, user_id, project_id, client_id, estimate_number, status, total, line_items, created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("signatures")
        .select(
          "id, document_id, document_type, status, signer_email, signer_name, signed_at, user_id, created_at",
        )
        .eq("user_id", user.id)
        .eq("document_type", "estimate"),
    ]);
    if (!mounted.current) return;
    if (error) {
      setState({ estimates: [], signatures: {}, loading: false, error: error.message });
      return;
    }
    const sigMap: Record<string, DbSignature> = {};
    if (!sigs.error && sigs.data) {
      for (const s of sigs.data as DbSignature[]) {
        sigMap[s.document_id] = s;
      }
    }
    setState({
      estimates: (estimates ?? []) as DbEstimate[],
      signatures: sigMap,
      loading: false,
      error: null,
    });
  }, [user]);

  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll();
    return () => {
      mounted.current = false;
    };
  }, [fetchAll]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const ch1 = supabase
      .channel(`estimates:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "estimates",
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchAll(),
      )
      .subscribe();
    const ch2 = supabase
      .channel(`signatures-est:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "signatures",
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [user, fetchAll]);

  return { ...state, refetch: fetchAll };
}
