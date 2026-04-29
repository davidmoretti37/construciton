"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/app/TopBar";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/format";

interface Worker {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: "supervisor" | "worker";
  hourly_rate: number | null;
  hours_this_week: number;
  active_project_id: string | null;
  active_project_name: string | null;
  is_clocked_in: boolean;
  invite_pending: boolean;
}

type Tab = "all" | "supervisors" | "workers" | "invites";

export default function WorkersPage() {
  const [team, setTeam] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"supervisor" | "worker">("worker");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState<string | null>(null);

  useEffect(() => {
    loadTeam();
  }, []);

  async function loadTeam() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        setTeam([]);
        return;
      }

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";
      const res = await fetch(`${backendUrl}/api/team`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setTeam(data);
      }
    } catch (err) {
      console.error("Failed to load team:", err);
    } finally {
      setLoading(false);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteOk(null);
    setInviting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        setInviteError("You must be signed in.");
        return;
      }

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";
      const res = await fetch(`${backendUrl}/api/team/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setInviteError(body.error || `Failed to send invite (${res.status}).`);
        return;
      }

      setInviteOk(`Invite sent to ${inviteEmail}.`);
      setInviteEmail("");
      await loadTeam();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  }

  const filtered = team.filter((m) => {
    if (tab === "supervisors" && m.role !== "supervisor") return false;
    if (tab === "workers" && m.role !== "worker") return false;
    if (tab === "invites" && !m.invite_pending) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.full_name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q)
    );
  });

  const counts = {
    all: team.length,
    supervisors: team.filter((m) => m.role === "supervisor").length,
    workers: team.filter((m) => m.role === "worker").length,
    invites: team.filter((m) => m.invite_pending).length,
  };

  return (
    <div>
      <TopBar title="Workers" />

      <div className="px-4 md:px-0 space-y-4">
        {/* Action bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team..."
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setInviteOpen((v) => !v);
              setInviteError(null);
              setInviteOk(null);
            }}
            className="rounded-xl bg-[#1E40AF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1E3A8A] transition-colors"
          >
            {inviteOpen ? "Close" : "Invite"}
          </button>
        </div>

        {/* Invite form */}
        {inviteOpen && (
          <form
            onSubmit={sendInvite}
            className="bg-white border border-gray-200 rounded-xl p-4 space-y-3"
          >
            <p className="text-sm font-semibold text-gray-900">Send invite</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@example.com"
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "supervisor" | "worker")
                }
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                <option value="worker">Worker</option>
                <option value="supervisor">Supervisor</option>
              </select>
              <button
                type="submit"
                disabled={inviting}
                className="rounded-xl bg-[#1E40AF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {inviting ? "Sending..." : "Send invite"}
              </button>
            </div>
            {inviteError && (
              <p className="text-xs text-red-600">{inviteError}</p>
            )}
            {inviteOk && (
              <p className="text-xs text-emerald-600">{inviteOk}</p>
            )}
          </form>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 text-xs font-medium">
          {(
            [
              ["all", "All"],
              ["supervisors", "Supervisors"],
              ["workers", "Workers"],
              ["invites", "Pending"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${
                tab === key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}{" "}
              <span className="text-gray-400">({counts[key]})</span>
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-7 h-7 text-gray-400"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-500">
              {search
                ? "No team members match your search."
                : tab === "invites"
                ? "No pending invites."
                : "No team members yet. Send an invite to get started."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((m) => {
              const initials = (m.full_name || m.email || "?")
                .split(/\s+|@/)
                .filter(Boolean)
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
              return (
                <div
                  key={m.id}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-blue-600">
                        {initials}
                      </span>
                      {m.is_clocked_in && (
                        <span className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {m.full_name || m.email || "Unnamed"}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {m.role === "supervisor" ? "Supervisor" : "Worker"}
                        {m.email ? ` · ${m.email}` : ""}
                      </p>
                    </div>
                    {m.invite_pending && (
                      <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                        Pending
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-xs font-semibold text-gray-900">
                        {m.hours_this_week.toFixed(1)}h
                      </p>
                      <p className="text-[10px] text-gray-400">This week</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-xs font-semibold text-gray-900">
                        {m.hourly_rate ? formatCurrency(m.hourly_rate) : "—"}
                      </p>
                      <p className="text-[10px] text-gray-400">Hourly</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p
                        className={`text-xs font-semibold ${
                          m.is_clocked_in ? "text-emerald-600" : "text-gray-400"
                        }`}
                      >
                        {m.is_clocked_in ? "On site" : "Off"}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {m.active_project_name || "No active job"}
                      </p>
                    </div>
                  </div>

                  {(m.phone || m.email) && (
                    <div className="flex gap-2 mt-3">
                      {m.phone && (
                        <a
                          href={`tel:${m.phone}`}
                          className="flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          Call
                        </a>
                      )}
                      {m.email && (
                        <a
                          href={`mailto:${m.email}`}
                          className="flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          Email
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
