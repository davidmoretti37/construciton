"use client";

import { cn } from "@/lib/cn";
import RowActions, { type RowAction } from "./RowActions";

interface Props {
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
  overflow?: RowAction[];
  className?: string;
}

export default function ActionGroup({ primary, secondary, overflow, className = "" }: Props) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {secondary}
      {primary}
      {overflow && overflow.length > 0 && <RowActions items={overflow} />}
    </div>
  );
}
