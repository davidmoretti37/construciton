"use client";

import { useAuth } from "@/contexts/AuthContext";
import NotificationBell from "./NotificationBell";

export default function TopBar({ title }: { title: string }) {
  const { profile } = useAuth();

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <header className="flex items-center justify-between px-4 pt-2 pb-3 md:pt-0 md:pb-4">
      <h1 className="text-[22px] md:text-2xl font-bold tracking-tight text-gray-900 truncate">
        {title}
      </h1>
      <div className="flex items-center gap-3">
        <NotificationBell />
        {/* Avatar: mobile only — desktop has it in sidebar */}
        <div className="md:hidden w-8 h-8 rounded-full bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] flex items-center justify-center">
          <span className="text-[11px] font-semibold text-white">
            {initials}
          </span>
        </div>
      </div>
    </header>
  );
}
