"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useAuth } from "@/contexts/AuthContext";
import type { DbContract, DbContractTemplate, DbSignature } from "@/types/database";

interface State {
  contracts: DbContract[];
  templates: DbContractTemplate[];
  signatures: Record<string, DbSignature>;
  loading: boolean;
  available: boolean;
  error: string | null;
}

export function useContracts() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({
    contracts: [],
    templates: [],
    signatures: {},
    loading: true,
    available: true,
    error: null,
  });
  const mounted = useRef(true);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setState({
        contracts: [],
        templates: [],
        signatures: {},
        loading: false,
        available: true,
        error: null,
      });
      return;
    }
    const supabase = createClient();
    const [contractsRes, templatesRes, sigsRes] = await Promise.all([
      supabase
        .from("contracts")
        .select(
          "id, user_id, project_id, client_id, title, status, template_id, document_id, body, created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("contract_templates")
        .select("id, user_id, name, body_markdown, created_at")
        .eq("user_id", user.id)
        .limit(50),
      supabase
        .from("signatures")
        .select(
          "id, document_id, document_type, status, signer_email, signer_name, signed_at, user_id, created_at",
        )
        .eq("user_id", user.id)
        .eq("document_type", "contract"),
    ]);

    if (!mounted.current) return;

    const tableMissing = contractsRes.error?.message?.includes("does not exist");
    if (tableMissing) {
      setState({
        contracts: [],
        templates: [],
        signatures: {},
        loading: false,
        available: false,
        error: null,
      });
      return;
    }

    const sigMap: Record<string, DbSignature> = {};
    if (!sigsRes.error && sigsRes.data) {
      for (const s of sigsRes.data as DbSignature[]) {
        sigMap[s.document_id] = s;
      }
    }

    setState({
      contracts: (contractsRes.data ?? []) as DbContract[],
      templates: (templatesRes.data ?? []) as DbContractTemplate[],
      signatures: sigMap,
      loading: false,
      available: true,
      error: contractsRes.error?.message ?? null,
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
    if (!user || !state.available) return;
    const supabase = createClient();
    const ch1 = supabase
      .channel(`contracts:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contracts",
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchAll(),
      )
      .subscribe();
    const ch2 = supabase
      .channel(`signatures-ct:${user.id}`)
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
  }, [user, state.available, fetchAll]);

  return { ...state, refetch: fetchAll };
}
