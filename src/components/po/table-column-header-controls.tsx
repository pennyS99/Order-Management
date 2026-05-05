"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Filter } from "lucide-react";
import { cn } from "@/lib/po/utils";
import type { TableSortDirection } from "@/hooks/use-table-filter-sort";

export type TableColumnHeaderVariant = "po" | "planner" | "slate";

const variantBtnClass: Record<TableColumnHeaderVariant, string> = {
  po: "hover:bg-[#2a2a2a]",
  planner: "hover:bg-[#2a2a2a]",
  slate: "hover:bg-zinc-800/80",
};

const variantActiveClass: Record<TableColumnHeaderVariant, string> = {
  po: "bg-[#2a2a2a] text-[#1D9E75]",
  planner: "bg-[#2a2a2a] text-[#1D9E75]",
  slate: "bg-zinc-800 text-[#1D9E75]",
};

type TableColumnHeaderControlButtonsProps = {
  label: string;
  columnId: string;
  filterActive: boolean;
  sortActive: boolean;
  sortDir: TableSortDirection | null;
  onFilterClick: (columnId: string) => void;
  onSortClick: (columnId: string) => void;
  variant?: TableColumnHeaderVariant;
  /** Override label span classes (thead cell title). */
  labelClassName?: string;
};

/**
 * Filter + sort icon buttons matching PO Extract, for use inside a `<th>`.
 */
export function TableColumnHeaderControlButtons({
  label,
  columnId,
  filterActive,
  sortActive,
  sortDir,
  onFilterClick,
  onSortClick,
  variant = "po",
  labelClassName,
}: TableColumnHeaderControlButtonsProps) {
  const v = variantBtnClass[variant];
  const a = variantActiveClass[variant];
  const defaultLabel =
    labelClassName ??
    (variant === "planner"
      ? "text-[11px] font-normal uppercase tracking-[0.04em] text-[#555]"
      : variant === "slate"
        ? "text-xs font-semibold uppercase tracking-wide text-slate-200"
        : "text-xs font-bold uppercase tracking-wider text-[#888888]");

  return (
    <div className="flex items-center gap-1">
      <span className={defaultLabel}>{label}</span>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onFilterClick(columnId)}
          aria-label={`Filter by ${label}`}
          aria-pressed={filterActive}
          className={cn("rounded p-0.5 transition-colors", v, filterActive && a)}
          title="Filter by column"
        >
          <Filter className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onSortClick(columnId)}
          aria-label={
            sortActive
              ? `Sort ${label} ${sortDir === "asc" ? "descending" : "ascending"}`
              : `Sort by ${label}`
          }
          aria-pressed={sortActive}
          className={cn("rounded p-0.5 transition-colors", v, sortActive && a)}
          title={sortActive ? `Sort ${sortDir === "asc" ? "descending" : "ascending"}` : "Sort"}
        >
          {sortActive ? (
            sortDir === "asc" ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  );
}
