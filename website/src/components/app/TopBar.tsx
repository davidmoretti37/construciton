"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import NotificationBell from "./NotificationBell";
import type { BreadcrumbSegment } from "@/types";

interface Props {
  title?: string;
  subtitle?: string;
  breadcrumb?: BreadcrumbSegment[];
  right?: React.ReactNode;
}

export default function TopBar({ title, subtitle, breadcrumb, right }: Props) {
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
    <header className="h-14 sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-[#e5e5ea] px-4 md:px-6 flex items-center justify-between -mx-4 md:-mx-6 lg:-mx-8 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav className="flex items-center gap-1.5 text-[13px] min-w-0">
            {breadcrumb.map((seg, i) => {
              const isLast = i === breadcrumb.length - 1;
              return (
                <span key={`${seg.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
                  {i > 0 && <span className="text-[#d2d2d7]">/</span>}
                  {seg.href && !isLast ? (
                    <Link
                      href={seg.href}
                      className="text-[#6e6e73] hover:text-[#1d1d1f] transition-colors truncate"
                    >
                      {seg.label}
                    </Link>
                  ) : (
                    <span
                      className={
                        isLast
                          ? "text-[#1d1d1f] font-medium truncate"
                          : "text-[#6e6e73] truncate"
                      }
                    >
                      {seg.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
        ) : (
          <div className="min-w-0">
            <h1 className="text-[18px] md:text-[20px] font-semibold tracking-tight text-[#1d1d1f] truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[12px] text-[#6e6e73] truncate -mt-0.5">{subtitle}</p>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {right}
        <NotificationBell />
        <div className="md:hidden w-8 h-8 rounded-full bg-gradient-to-br from-[#0071e3] to-[#005bb5] flex items-center justify-center">
          <span className="text-[11px] font-semibold text-white">{initials}</span>
        </div>
      </div>
    </header>
  );
}
