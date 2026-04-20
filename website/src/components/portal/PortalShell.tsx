"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { useEffect, useState } from "react";
import { fetchBranding, type PortalBranding } from "@/services/portal";

const navItems = [
  { href: "/portal", label: "Dashboard", icon: "home" },
  { href: "/portal/invoices", label: "Invoices", icon: "invoice" },
  { href: "/portal/services", label: "Services", icon: "service" },
];

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const { client, isLoading, isAuthenticated, logout } = usePortalAuth();
  const pathname = usePathname();
  const [branding, setBranding] = useState<PortalBranding | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchBranding().then(setBranding).catch(() => {});
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Session Expired</h1>
          <p className="text-gray-600 mb-4">
            Your session has expired. Please use the link sent to you to access the portal.
          </p>
        </div>
      </div>
    );
  }

  const primaryColor = branding?.primary_color || "#2563eb";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-3"
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {branding?.logo_url ? (
              <img
                src={branding.logo_url}
                alt={branding.business_name}
                className="h-8 w-8 rounded-lg object-cover"
              />
            ) : (
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: primaryColor }}
              >
                {(branding?.business_name || "C")[0].toUpperCase()}
              </div>
            )}
            <span className="font-semibold text-gray-900 text-sm">
              {branding?.business_name || "Client Portal"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 hidden sm:block">
              {client?.full_name}
            </span>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 pb-24 md:pb-8">
        {children}
      </main>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Sign out?</h3>
            <p className="text-sm text-gray-500 mb-5">
              You&apos;ll need a new link from your contractor to sign back in.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg py-2.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { logout(); setShowLogoutConfirm(false); }}
                className="flex-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg py-2.5 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav (mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around py-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/portal"
                ? pathname === "/portal"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                  isActive ? "text-blue-600" : "text-gray-400"
                }`}
                style={isActive ? { color: primaryColor } : undefined}
              >
                <NavIcon name={item.icon} active={isActive} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const cls = "w-5 h-5";
  const sw = active ? 0 : 1.5;
  const fill = active ? "currentColor" : "none";

  switch (name) {
    case "home":
      return (
        <svg className={cls} fill={fill} stroke="currentColor" strokeWidth={sw} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      );
    case "invoice":
      return (
        <svg className={cls} fill={fill} stroke="currentColor" strokeWidth={sw} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case "service":
      return (
        <svg className={cls} fill={fill} stroke="currentColor" strokeWidth={sw} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M21.015 4.356v4.992" />
        </svg>
      );
    default:
      return null;
  }
}
