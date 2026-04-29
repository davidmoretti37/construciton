import { AppShell } from "./AppShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sylk App",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
