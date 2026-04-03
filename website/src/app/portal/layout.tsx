import { PortalAuthProvider } from "@/contexts/PortalAuthContext";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Client Portal — Sylk",
  description: "View your projects, estimates, and invoices.",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalAuthProvider>
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    </PortalAuthProvider>
  );
}
