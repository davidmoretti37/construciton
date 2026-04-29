"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useAuth } from "@/contexts/AuthContext";
import type { DbInvoice } from "@/types/database";

interface State {
  invoices: DbInvoice[];
  loading: boolean;
  error: string | null;
}

export function useInvoices() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({
    invoices: [],
    loading: true,
    error: null,
  });
  const mounted = useRef(true);

  const fetchInvoices = useCallback(async () => {
    if (!user) {
      setState({ invoices: [], loading: false, error: null });
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("invoices")
      .select(
        "id, user_id, project_id, client_id, invoice_number, total, amount_paid, status, issued_at, due_date, paid_at, line_items, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!mounted.current) return;
    if (error) {
      setState({ invoices: [], loading: false, error: error.message });
      return;
    }
    setState({
      invoices: (data ?? []) as DbInvoice[],
      loading: false,
      error: null,
    });
  }, [user]);

  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInvoices();
    return () => {
      mounted.current = false;
    };
  }, [fetchInvoices]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`invoices:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchInvoices();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchInvoices]);

  return {
    ...state,
    refetch: fetchInvoices,
  };
}
