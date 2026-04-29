"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/components/app/guards/subscription-gate";
import { envPresence } from "@/lib/env";

interface MeResponse {
  user?: { id: string; email?: string };
  profile?: Record<string, unknown> | null;
  error?: string;
}

const isProd = process.env.NODE_ENV === "production";

export default function DebugProbePage() {
  const { user, profile, role, isOwner, isLoading } = useAuth();
  const sub = useSubscription();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { method: "GET" })
      .then(async (r) => {
        const data = (await r.json()) as MeResponse;
        if (!cancelled) {
          if (!r.ok) setMeError(data?.error ?? `HTTP ${r.status}`);
          setMe(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setMeError(err instanceof Error ? err.message : "Failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isProd) {
    return (
      <div className="px-6 py-12">
        <h1 className="text-xl font-semibold text-gray-900">Not available</h1>
        <p className="mt-2 text-sm text-gray-600">
          The debug probe is disabled in production.
        </p>
      </div>
    );
  }

  const env = envPresence();

  return (
    <div className="space-y-8 px-2 py-4 md:px-0">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Internal
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Debug probe</h1>
        <p className="mt-1 text-sm text-gray-600">
          Inspect auth, environment, and subscription state in development.
        </p>
      </header>

      <Section title="Environment">
        <ProbeTable
          rows={[
            ["NODE_ENV", String(process.env.NODE_ENV ?? "")],
            ...Object.entries(env).map(([key, present]) => [
              key,
              present ? <Badge tone="ok">present</Badge> : <Badge tone="warn">missing</Badge>,
            ] as [string, React.ReactNode]),
          ]}
        />
      </Section>

      <Section title="Auth (client)">
        <ProbeTable
          rows={[
            ["isLoading", String(isLoading)],
            ["user.id", user?.id ?? "—"],
            ["user.email", user?.email ?? "—"],
            ["profile.role", role ?? "—"],
            ["profile.full_name", (profile?.full_name as string) ?? "—"],
            [
              "isOwner",
              isOwner ? <Badge tone="ok">true</Badge> : <Badge tone="warn">false</Badge>,
            ],
          ]}
        />
      </Section>

      <Section title="Auth (server /api/auth/me)">
        {meError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {meError}
          </p>
        )}
        <pre className="mt-2 overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-800">
          {JSON.stringify(me, null, 2)}
        </pre>
      </Section>

      <Section title="Subscription gate">
        <ProbeTable
          rows={[
            ["status", sub.status],
            [
              "allowed",
              sub.allowed ? (
                <Badge tone="ok">true</Badge>
              ) : (
                <Badge tone="warn">false</Badge>
              ),
            ],
            ["reason", sub.reason ?? "—"],
            ["error", sub.error ?? "—"],
          ]}
        />
        <button
          type="button"
          onClick={() => sub.refresh()}
          className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      <div className="card p-4">{children}</div>
    </section>
  );
}

function ProbeTable({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-gray-100 last:border-0">
            <th className="w-1/3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              {k}
            </th>
            <td className="py-2 font-mono text-xs text-gray-800">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-green-50 text-green-700 border-green-200"
      : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}
