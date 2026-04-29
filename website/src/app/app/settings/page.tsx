"use client";

import { useState } from "react";
import Link from "next/link";
import TopBar from "@/components/app/TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase-browser";
import { CheckoutButton } from "@/components/forms/CheckoutButton";

export default function SettingsPage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [companyName, setCompanyName] = useState(profile?.company_name ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.id) return;
    setError(null);
    setSaving(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          company_name: companyName.trim() || null,
        })
        .eq("id", profile.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      await refreshProfile();
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <TopBar title="Settings" />

      <div className="px-4 md:px-0 space-y-4">
        {/* Account header */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] flex items-center justify-center">
            <span className="text-sm font-semibold text-white">
              {(profile?.full_name || profile?.email || "?")
                .split(/\s+|@/)
                .filter(Boolean)
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {profile?.full_name || "—"}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {profile?.email || "—"}
            </p>
          </div>
          <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-full uppercase tracking-wider">
            {profile?.role || "owner"}
          </span>
        </div>

        {/* Profile form */}
        <section>
          <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Profile
          </h2>
          <form
            onSubmit={saveProfile}
            className="bg-white border border-gray-200 rounded-xl p-4 space-y-3"
          >
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Full name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Business name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Acme Construction"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Email
              </label>
              <input
                type="email"
                value={profile?.email ?? ""}
                readOnly
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Contact support to change your email.
              </p>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#1E40AF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#1E3A8A] transition-colors"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
              {savedAt && (
                <span className="text-xs text-emerald-600">
                  Saved at {savedAt}
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Subscription */}
        <section>
          <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Subscription
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Sylk Pro
                </p>
                <p className="text-xs text-gray-500">
                  Manage projects, clients, and team without limits.
                </p>
              </div>
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                Active
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <CheckoutButton
                mode="subscription"
                priceId={process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID}
                amount={
                  process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID ? undefined : 9900
                }
                productName="Sylk Pro"
                className="rounded-xl bg-[#1E40AF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E3A8A] transition-colors disabled:opacity-50"
              >
                Manage billing
              </CheckoutButton>
              <Link
                href="/checkout/success"
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                View receipts
              </Link>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Notifications
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {[
              ["Daily report digest", "Get a morning summary of yesterday's work"],
              ["Overdue invoice alerts", "Notify me when an invoice is 7+ days late"],
              ["Forgotten clock-out", "Notify me when a worker is clocked in 10+ hours"],
            ].map(([label, hint]) => (
              <label
                key={label}
                className="flex items-start justify-between gap-3 p-4 cursor-pointer"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
                </div>
                <input
                  type="checkbox"
                  defaultChecked
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-[#1E40AF] focus:ring-[#1E40AF]"
                />
              </label>
            ))}
          </div>
        </section>

        {/* Legal */}
        <section>
          <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Legal
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            <Link
              href="/terms"
              className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm text-gray-900">Terms of Service</span>
              <span className="text-gray-400">›</span>
            </Link>
            <Link
              href="/privacy"
              className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm text-gray-900">Privacy Policy</span>
              <span className="text-gray-400">›</span>
            </Link>
          </div>
        </section>

        {/* Sign out */}
        <button
          type="button"
          onClick={signOut}
          className="w-full bg-white border border-gray-200 rounded-xl p-4 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors text-left"
        >
          Sign Out
        </button>

        <div className="h-8" />
      </div>
    </div>
  );
}
