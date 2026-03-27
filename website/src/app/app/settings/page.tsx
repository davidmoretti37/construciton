"use client";

import TopBar from "@/components/app/TopBar";
import { useAuth } from "@/contexts/AuthContext";

export default function SettingsPage() {
  const { profile, signOut } = useAuth();

  return (
    <div>
      <TopBar title="Settings" />
      <div className="px-4 space-y-3">
        {/* Account info */}
        <div className="card p-4">
          <p className="text-sm font-medium text-gray-900">
            {profile?.full_name || "—"}
          </p>
          <p className="text-xs text-gray-400">{profile?.email || "—"}</p>
        </div>

        {/* Placeholder sections */}
        <div className="card p-4 text-sm text-gray-400">
          Settings — coming in Phase 5
        </div>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="w-full card p-4 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors text-left"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
