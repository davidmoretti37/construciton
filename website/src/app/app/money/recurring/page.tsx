"use client";

import MoneyShell from "@/components/app/money/MoneyShell";
import EmptyState from "@/components/ui/EmptyState";
import DotPattern from "@/components/ui/DotPattern";

export default function RecurringPage() {
  return (
    <MoneyShell>
      <section className="relative -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-8 lg:px-10 pt-2 pb-6 bg-[#fbfbfd] overflow-hidden">
        <DotPattern size={24} className="absolute inset-0 opacity-[0.10]" />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/4 -right-24 w-[520px] h-[520px] rounded-full bg-[#0071e3]/[0.05] blur-[140px]"
        />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#86868b]">
            Recurring billing
          </p>
          <h2 className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            Subscriptions and auto-send rules.
          </h2>
        </div>
        <div className="h-px mt-6 bg-gradient-to-r from-transparent via-[#0071e3]/20 to-transparent" />
      </section>

      <section className="px-2 md:px-0 py-6">
        <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl">
          <EmptyState
            icon="inbox"
            title="Recurring billing — phase 2"
            description="Subscription invoices and auto-send rules ship in a later release. We'll email you when it's ready."
          />
        </div>
      </section>
    </MoneyShell>
  );
}
