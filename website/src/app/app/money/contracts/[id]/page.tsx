"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MoneyShell from "@/components/app/money/MoneyShell";
import StatusBadge from "@/components/ui/StatusBadge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import ErrorBanner from "@/components/ui/ErrorBanner";
import DotPattern from "@/components/ui/DotPattern";
import Drawer from "@/components/ui/Drawer";
import ContractEditor from "@/components/app/money/ContractEditor";
import SendDocumentModal from "@/components/app/money/SendDocumentModal";
import ESignStatusBadge from "@/components/app/money/ESignStatusBadge";
import { useToast } from "@/components/ui/toast-provider";
import { createClient } from "@/lib/supabase-browser";
import { useAuth } from "@/contexts/AuthContext";
import { deleteContract } from "@/app/actions/contracts";
import { formatDate } from "@/lib/format";
import type {
  DbContract,
  DbContractTemplate,
  DbSignature,
} from "@/types/database";

export default function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const [contract, setContract] = useState<DbContract | null>(null);
  const [templates, setTemplates] = useState<DbContractTemplate[]>([]);
  const [signature, setSignature] = useState<DbSignature | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [esignOpen, setEsignOpen] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const [cRes, tRes, sRes] = await Promise.all([
      supabase
        .from("contracts")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("contract_templates")
        .select("id, user_id, name, body_markdown, created_at")
        .eq("user_id", user.id),
      supabase
        .from("signatures")
        .select("*")
        .eq("document_id", id)
        .eq("document_type", "contract")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (cRes.error?.message?.includes("does not exist")) {
      setAvailable(false);
      setLoading(false);
      return;
    }
    if (cRes.error) {
      setError(cRes.error.message);
      setLoading(false);
      return;
    }
    setContract(cRes.data as DbContract);
    if (!tRes.error && tRes.data) setTemplates(tRes.data as DbContractTemplate[]);
    if (!sRes.error && sRes.data) setSignature(sRes.data as DbSignature);
    else setSignature(null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  useEffect(() => {
    if (!user || !available) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`contract-detail:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contracts",
          filter: `id=eq.${id}`,
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "signatures",
          filter: `document_id=eq.${id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id, available]);

  async function handleCancelSignature() {
    if (!signature) return;
    try {
      const res = await fetch(`/api/esign/cancel/${signature.id}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Signature canceled", variant: "success" });
      load();
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Cancel failed",
        variant: "error",
      });
    }
  }

  async function handleDelete() {
    if (!contract) return;
    if (!window.confirm("Delete this contract?")) return;
    const res = await deleteContract(contract.id);
    if (res.ok) {
      toast({ title: "Contract deleted", variant: "success" });
      router.push("/app/money/contracts");
    } else {
      toast({ title: res.error ?? "Delete failed", variant: "error" });
    }
  }

  if (!available) {
    return (
      <MoneyShell>
        <div className="px-2 md:px-0 py-6">
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl">
            <EmptyState
              icon="folder-open"
              title="Contracts coming soon"
              description="Tables are not provisioned for this deployment yet."
            />
          </div>
          <Link
            href="/app/money/contracts"
            className="inline-block mt-4 text-[13px] text-[#0071e3] hover:underline"
          >
            ← Back to contracts
          </Link>
        </div>
      </MoneyShell>
    );
  }

  if (loading && !contract) {
    return (
      <MoneyShell>
        <div className="px-2 md:px-0 py-6 space-y-4">
          <Skeleton height={32} width={240} />
          <Skeleton height={400} />
        </div>
      </MoneyShell>
    );
  }

  if (error || !contract) {
    return (
      <MoneyShell>
        <div className="px-2 md:px-0 py-6">
          <ErrorBanner message={error ?? "Contract not found"} onRetry={load} />
          <Link
            href="/app/money/contracts"
            className="inline-block mt-4 text-[13px] text-[#0071e3] hover:underline"
          >
            ← Back to contracts
          </Link>
        </div>
      </MoneyShell>
    );
  }

  return (
    <MoneyShell>
      <section className="relative -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-8 lg:px-10 pt-2 pb-6 bg-[#fbfbfd] overflow-hidden">
        <DotPattern size={24} className="absolute inset-0 opacity-[0.10]" />
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 -right-32 w-[520px] h-[520px] rounded-full bg-[#0071e3]/[0.06] blur-[140px]"
        />

        <div className="relative">
          <nav className="text-[12px] text-[#86868b] flex items-center gap-1.5 mb-3">
            <Link href="/app/money/contracts" className="hover:text-[#1d1d1f] transition-colors">
              Money
            </Link>
            <span>/</span>
            <Link href="/app/money/contracts" className="hover:text-[#1d1d1f] transition-colors">
              Contracts
            </Link>
            <span>/</span>
            <span className="text-[#1d1d1f]">{contract.title ?? "Untitled"}</span>
          </nav>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
                {contract.title ?? "Untitled contract"}
              </h1>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={contract.status} />
                <ESignStatusBadge status={signature?.status ?? "none"} />
              </div>
            </div>
          </div>
        </div>

        <div className="h-px mt-6 bg-gradient-to-r from-transparent via-[#0071e3]/20 to-transparent" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 px-2 md:px-0 py-6">
        <div className="lg:col-span-8">
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]">
            <ContractEditor
              contract={contract}
              templates={templates}
              onSuccess={() => load()}
            />
          </div>
        </div>

        <aside className="lg:col-span-4 lg:sticky lg:top-[72px] self-start space-y-4">
          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#86868b] mb-3">
              Signature
            </p>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[13px] text-[#6e6e73]">Status</span>
              <ESignStatusBadge status={signature?.status ?? "none"} />
            </div>
            {signature ? (
              <div className="space-y-2 text-[12px] mb-4">
                <div className="flex justify-between">
                  <span className="text-[#6e6e73]">Signer</span>
                  <span className="text-[#1d1d1f]">{signature.signer_name ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6e6e73]">Email</span>
                  <span className="font-mono text-[#1d1d1f]">{signature.signer_email}</span>
                </div>
                {signature.signed_at && (
                  <div className="flex justify-between">
                    <span className="text-[#6e6e73]">Signed</span>
                    <span className="font-mono tabular-nums text-[#1d1d1f]">
                      {formatDate(signature.signed_at)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-[#6e6e73] mb-4">
                No signature requested yet.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Button variant="primary" size="sm" onClick={() => setEsignOpen(true)}>
                {signature?.status === "pending"
                  ? "Resend signature link"
                  : "Request signature"}
              </Button>
              {signature?.status === "pending" && (
                <Button variant="ghost" size="sm" onClick={handleCancelSignature}>
                  Cancel request
                </Button>
              )}
            </div>
          </div>

          <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#86868b] mb-3">
              Danger zone
            </p>
            <Button variant="ghost" size="sm" onClick={handleDelete}>
              Delete contract
            </Button>
          </div>
        </aside>
      </section>

      <Drawer
        open={esignOpen}
        onClose={() => setEsignOpen(false)}
        title="Request signature"
        description="Send a signing link to the client."
      >
        <SendDocumentModal
          documentId={contract.id}
          documentNumber={contract.title ?? undefined}
          type="contract"
          mode="esign"
          onSuccess={() => {
            setEsignOpen(false);
            load();
          }}
          onClose={() => setEsignOpen(false)}
        />
      </Drawer>
    </MoneyShell>
  );
}
