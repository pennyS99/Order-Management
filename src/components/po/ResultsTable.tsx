"use client";

import React, { useCallback, useMemo } from "react";
import { ExportButton } from "@/components/po/ExportButton";
import { TableColumnHeaderControlButtons } from "@/components/po/table-column-header-controls";
import { TableFilterToolbar } from "@/components/po/table-filter-toolbar";
import { useTableFilterSort } from "@/hooks/use-table-filter-sort";
import type { POLineItem, HeaderConfig } from "@/lib/po/types";
import { cn } from "@/lib/po/utils";

interface ResultsTableProps {
  data: POLineItem[];
  headers: HeaderConfig[];
  onDataChange?: (data: POLineItem[]) => void;
  showToolbar?: boolean;
  className?: string;
  tableContainerClassName?: string;
  fill?: boolean;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateDdMmmYy(val: string | null): string {
  if (!val || typeof val !== "string") return "";
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return val;
  const [, d, month, y] = m;
  const yy = y.length === 2 ? y : y.slice(-2);
  const monIdx = parseInt(month, 10) - 1;
  if (monIdx < 0 || monIdx > 11) return val;
  return `${d.padStart(2, "0")}-${MONTH_ABBR[monIdx]}-${yy}`;
}

export function ResultsTable({
  data,
  headers,
  showToolbar = true,
  className,
  tableContainerClassName,
  fill = false,
}: ResultsTableProps) {
  const activeHeaders = useMemo(
    () => headers.filter((h) => h.enabled).toSorted((a, b) => a.order - b.order),
    [headers],
  );

  const columnIds = useMemo(() => activeHeaders.map((h) => h.key as string), [activeHeaders]);

  const getColumnText = useCallback((row: POLineItem, columnId: string) => {
    if (columnId === "po_date" || columnId === "delivery_date") {
      return formatDateDdMmmYy(row[columnId as keyof POLineItem] as string | null);
    }
    return String(row[columnId as keyof POLineItem] ?? "");
  }, []);

  const getGlobalSearchText = useCallback((row: POLineItem) => {
    return [
      row.retailer,
      row.po_number,
      row.product_name,
      row.product_code,
      row.delivery_location,
    ]
      .map((x) => String(x ?? ""))
      .join(" ");
  }, []);

  const {
    filterText,
    setFilterText,
    activeFilterColumn,
    sortColumn,
    sortDir,
    displayRows,
    toggleSort,
    toggleFilterColumn,
  } = useTableFilterSort(data, {
    columnIds,
    getColumnText,
    getGlobalSearchText,
  });

  const retailers = useMemo(() => Array.from(new Set(data.map((r) => r.retailer || "Unknown"))), [data]);

  const filterPlaceholder = activeFilterColumn
    ? `Search ${activeHeaders.find((h) => h.key === activeFilterColumn)?.label ?? activeFilterColumn}...`
    : "Search PO lines...";

  return (
    <div
      className={cn(
        fill ? "flex min-h-0 flex-1 flex-col gap-4" : "space-y-4",
        className,
      )}
    >
      {showToolbar ? (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-[#888888]">
            <span>{new Set(data.map((r) => r.po_number || "")).size || 0} POs</span>
            <span className="text-[#5c5c5c]">·</span>
            <span>{data.length} SKUs</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {retailers.map((r) => (
              <span
                key={r}
                className="rounded-md border border-[#2a2a2a] bg-[#141414] px-2 py-0.5 text-xs font-semibold text-[#888888]"
              >
                {r}
              </span>
            ))}
          </div>
          <TableFilterToolbar
            id="results-global-filter"
            value={filterText}
            onChange={setFilterText}
            placeholder={filterPlaceholder}
          />
          <ExportButton data={data} headers={headers} disabled={data.length === 0} />
        </div>
      ) : null}

      <div
        className={cn(
          fill
            ? "min-h-0 flex-1 overflow-auto rounded-lg border border-[#2a2a2a]"
            : "max-h-[50vh] overflow-auto rounded-lg border border-[#2a2a2a]",
          tableContainerClassName,
        )}
      >
        <table className="w-full text-sm text-[#e0e0e0]">
          <caption className="sr-only">Extracted records results table</caption>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a]">
              {activeHeaders.map((h) => (
                <th
                  key={h.key}
                  className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-[#888888]"
                >
                  <TableColumnHeaderControlButtons
                    label={h.label}
                    columnId={h.key as string}
                    filterActive={activeFilterColumn === h.key}
                    sortActive={sortColumn === h.key}
                    sortDir={sortColumn === h.key ? sortDir : null}
                    onFilterClick={toggleFilterColumn}
                    onSortClick={toggleSort}
                    variant="po"
                    labelClassName="text-inherit font-bold uppercase tracking-wider"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => {
              const lowConfidence = typeof row.confidence === "number" && row.confidence < 0.6;
              return (
                <tr
                  key={`${row.retailer ?? ""}-${row.po_number ?? ""}-${row.product_code ?? ""}-${rowIndex}`}
                  className={cn(
                    "border-t border-[#2a2a2a] transition-colors duration-150 hover:bg-[#141414] [content-visibility:auto] [contain-intrinsic-size:0_34px]",
                    lowConfidence && "bg-amber-500/10",
                  )}
                >
                  {activeHeaders.map((h) => {
                    const isDateCol = h.key === "po_date" || h.key === "delivery_date";
                    const isCustName = h.key === "delivery_location";
                    let displayVal = isDateCol
                      ? formatDateDdMmmYy(row[h.key] as string | null)
                      : String(row[h.key] ?? "");
                    if (isCustName && displayVal) {
                      displayVal = displayVal.toUpperCase();
                    }
                    return (
                      <td
                        key={h.key}
                        className={cn(
                          "whitespace-nowrap px-3 py-2 text-[#e0e0e0]",
                          isCustName ? "min-w-[140px] text-sm" : "text-sm",
                        )}
                      >
                        {displayVal}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
