"use client";

import { cn } from "@/lib/cn";
import type { DensityMode } from "@/types";

export interface Column<T> {
  key: string;
  header: string;
  accessor?: keyof T;
  render?: (row: T) => React.ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
  className?: string;
  thClassName?: string;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  density?: DensityMode;
  onRowClick?: (row: T) => void;
  stickyHeader?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
}

export default function DataTable<T>({
  columns,
  data,
  rowKey,
  density = "comfortable",
  onRowClick,
  stickyHeader = false,
  emptyState,
  className = "",
}: Props<T>) {
  const rowH = density === "compact" ? "h-11" : "h-14";

  return (
    <div
      className={cn(
        "bg-white ring-1 ring-[#e5e5ea] rounded-2xl",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]",
        "overflow-hidden",
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead
            className={cn(
              "bg-[#fbfbfd] text-[12px] uppercase tracking-wide font-medium text-[#6e6e73]",
              stickyHeader && "sticky top-0 z-10"
            )}
          >
            <tr className="h-10">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-4 font-medium",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.thClassName
                  )}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  {emptyState ?? (
                    <div className="text-center py-10 text-[13px] text-[#86868b]">No results</div>
                  )}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    rowH,
                    "border-t border-[#e5e5ea] transition-colors",
                    onRowClick && "cursor-pointer hover:bg-[#fbfbfd]"
                  )}
                >
                  {columns.map((col) => {
                    const content = col.render
                      ? col.render(row)
                      : col.accessor
                      ? (row[col.accessor] as React.ReactNode)
                      : null;
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 align-middle text-[13px] text-[#1d1d1f]",
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center",
                          col.className
                        )}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
