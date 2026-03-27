import { AuthProvider } from "@/contexts/AuthContext";
import BottomTabBar from "@/components/app/BottomTabBar";
import DesktopSidebar from "@/components/app/DesktopSidebar";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sylk App",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex min-h-screen bg-gray-50">
        {/* Desktop sidebar — hidden on mobile */}
        <DesktopSidebar />

        {/* Main content */}
        <main className="flex-1 min-h-screen bg-white md:bg-gray-50">
          <div className="max-w-[430px] md:max-w-none mx-auto md:mx-0 pb-24 md:pb-8 md:p-6 lg:p-8">
            {children}
          </div>
        </main>

        {/* Mobile bottom tabs — hidden on desktop */}
        <BottomTabBar />
      </div>
    </AuthProvider>
  );
}
