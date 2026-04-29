import type { ReactNode } from "react";

export default function MoneyLayout({ children }: { children: ReactNode }) {
  return <div className="relative">{children}</div>;
}
