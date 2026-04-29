"use client";

import type { ReactNode } from "react";
import TopBar from "@/components/app/TopBar";
import Tabs from "@/components/ui/Tabs";

const TABS = [
  { key: "invoices", label: "Invoices", href: "/app/money/invoices" },
  { key: "estimates", label: "Estimates", href: "/app/money/estimates" },
  { key: "contracts", label: "Contracts", href: "/app/money/contracts" },
  { key: "recurring", label: "Recurring", href: "/app/money/recurring" },
  { key: "bank", label: "Bank", href: "/app/money/bank" },
  { key: "reconciliation", label: "Reconciliation", href: "/app/money/reconciliation" },
];

interface Props {
  title?: string;
  subtitle?: string;
  topRight?: ReactNode;
  children: ReactNode;
}

export default function MoneyShell({
  title = "Money",
  subtitle = "Invoices, estimates, contracts",
  topRight,
  children,
}: Props) {
  return (
    <div className="relative">
      <TopBar
        title={title}
        subtitle={subtitle}
        right={
          <div className="hidden lg:flex items-center gap-3">
            <Tabs items={TABS} variant="pill" />
            {topRight}
          </div>
        }
      />

      <div className="lg:hidden -mt-3 mb-4 overflow-x-auto">
        <Tabs items={TABS} variant="pill" />
      </div>

      {children}
    </div>
  );
}
