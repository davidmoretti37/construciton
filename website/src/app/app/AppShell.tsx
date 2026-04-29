"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import BottomTabBar from "@/components/app/BottomTabBar";
import DesktopSidebar from "@/components/app/DesktopSidebar";
import { RequireOwner } from "@/components/app/guards/require-owner";
import { SubscriptionGate } from "@/components/app/guards/subscription-gate";
import { ToastProvider } from "@/components/ui/toast-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <RequireOwner>
          <SubscriptionGate>
            <div className="flex min-h-screen bg-gray-50">
              <DesktopSidebar />
              <main className="flex-1 min-h-screen bg-white md:bg-gray-50">
                <div className="max-w-[430px] md:max-w-none mx-auto md:mx-0 pb-24 md:pb-8 md:p-6 lg:p-8">
                  {children}
                </div>
              </main>
              <BottomTabBar />
            </div>
          </SubscriptionGate>
        </RequireOwner>
      </ToastProvider>
    </AuthProvider>
  );
}
