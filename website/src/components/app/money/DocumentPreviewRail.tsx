"use client";

import Link from "next/link";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import DocumentPreviewCard from "./DocumentPreviewCard";
import type { DbInvoice } from "@/types/database";

interface Props {
  selectedId?: string | null;
  list: DbInvoice[];
  onSend?: (invoice: DbInvoice) => void;
}

export default function DocumentPreviewRail({ selectedId, list, onSend }: Props) {
  const selected = selectedId ? list.find((i) => i.id === selectedId) ?? null : null;
  const featured = selected ?? list[0] ?? null;
  const others = list.filter((i) => i.id !== featured?.id).slice(0, 3);

  if (!featured) {
    return (
      <aside className="space-y-4">
        <RailHeader />
        <div className="bg-white ring-1 ring-[#e5e5ea] rounded-2xl">
          <EmptyState
            icon="money"
            title="No document selected"
            description="Pick an invoice on the left to preview here, or create a new one."
          />
        </div>
      </aside>
    );
  }

  return (
    <aside className="space-y-4">
      <RailHeader />
      <DocumentPreviewCard
        invoice={featured}
        variant="featured"
      />
      {featured && (
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={onSend ? () => onSend(featured) : undefined}
          >
            Send
          </Button>
          <Button
            variant="ghost"
            size="sm"
            href={`/app/money/invoices/${featured.id}`}
          >
            Open
          </Button>
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-2 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
            Recent
          </p>
          {others.map((inv) => (
            <DocumentPreviewCard
              key={inv.id}
              invoice={inv}
              variant="compact"
              href={`/app/money/invoices/${inv.id}`}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

function RailHeader() {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#86868b]">
        Document preview
      </p>
      <Link
        href="/app/money/invoices"
        className="text-[11px] text-[#0071e3] hover:underline"
      >
        View all
      </Link>
    </div>
  );
}
