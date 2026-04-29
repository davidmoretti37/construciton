"use client";

import { cn } from "@/lib/cn";
import StatusBadge from "@/components/ui/StatusBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import ActionGroup from "@/components/ui/ActionGroup";
import Button from "@/components/ui/Button";

interface Props {
  name: string;
  address?: string;
  client?: string;
  status: string;
  phaseLabel?: string;
  progress: number;
  onSendUpdate?: () => void;
  onAddInvoice?: () => void;
  editHref?: string;
  className?: string;
}

export default function ProjectHeader({
  name,
  address,
  client,
  status,
  phaseLabel,
  progress,
  onSendUpdate,
  onAddInvoice,
  editHref,
  className = "",
}: Props) {
  return (
    <div
      className={cn(
        "bg-white ring-1 ring-[#e5e5ea] rounded-2xl p-6",
        "shadow-[0_2px_4px_rgba(0,0,0,0.04),0_4px_8px_rgba(0,0,0,0.06),0_8px_16px_rgba(0,0,0,0.04)]",
        "flex flex-col gap-5 md:flex-row md:items-start md:gap-6",
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <StatusBadge status={status} />
          {phaseLabel && <StatusBadge variant="info">{phaseLabel}</StatusBadge>}
        </div>
        <h1 className="text-[26px] md:text-[28px] font-semibold tracking-tight text-[#1d1d1f] truncate">
          {name}
        </h1>
        {address && (
          <p className="text-[14px] text-[#6e6e73] mt-1 truncate">{address}</p>
        )}
        {client && (
          <p className="text-[13px] text-[#86868b] mt-1">
            <span className="text-[#6e6e73]">Client:</span> {client}
          </p>
        )}
        <div className="mt-4 max-w-md">
          <ProgressBar value={progress} showLabel />
        </div>
      </div>
      <div className="shrink-0 flex md:justify-end">
        <ActionGroup
          primary={
            <Button size="sm" onClick={onSendUpdate}>
              Send update
            </Button>
          }
          secondary={
            <Button size="sm" variant="ghost" onClick={onAddInvoice}>
              Add invoice
            </Button>
          }
          overflow={[
            { label: "Edit", href: editHref },
            { label: "Duplicate", disabled: true },
            { separator: true },
            { label: "Archive", danger: true, disabled: true },
          ]}
        />
      </div>
    </div>
  );
}
