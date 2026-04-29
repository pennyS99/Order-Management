"use client";

import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter } from "lucide-react";
import { ExportButton } from "@/components/po/ExportButton";
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
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<keyof POLineItem | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [columnFilter, setColumnFilter] = useState<keyof POLineItem | null>(null);

  const activeHeaders = headers
    .filter((h) => h.enabled)
    .toSorted((a, b) => a.order - b.order);

  const filteredData = useMemo(() => {
    if (!filter.trim()) return data;
    const q = filter.toLowerCase();
    if (columnFilter) {
      return data.filter((row) =>
        String(row[columnFilter] ?? "").toLowerCase().includes(q)
      );
    }
    return data.filter(
      (row) =>
        (row.retailer || "").toLowerCase().includes(q) ||
        (row.po_number || "").toLowerCase().includes(q) ||
        (row.product_name || "").toLowerCase().includes(q) ||
        (row.product_code || "").toLowerCase().includes(q) ||
        (row.delivery_location || "").toLowerCase().includes(q)
    );
  }, [data, filter, columnFilter]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return filteredData.toSorted((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const aVal = va === null || va === undefined ? "" : String(va);
      const bVal = vb === null || vb === undefined ? "" : String(vb);
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir]);

  const handleSort = (key: keyof POLineItem) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleFilterClick = (key: keyof POLineItem) => {
    setColumnFilter((prev) => (prev === key ? null : key));
  };

  const retailers = useMemo(
    () => Array.from(new Set(data.map((r) => r.retailer || "Unknown"))),
    [data]
  );

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
        <label htmlFor="results-global-filter" className="sr-only">
          {columnFilter
            ? `Filter rows by ${activeHeaders.find((h) => h.key === columnFilter)?.label ?? columnFilter}`
            : "Filter rows"}
        </label>
        <input
          id="results-global-filter"
          type="text"
          placeholder={columnFilter ? `Filter ${activeHeaders.find((h) => h.key === columnFilter)?.label ?? columnFilter}...` : "Filter..."}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="min-w-[180px] max-w-sm flex-1 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-xs text-[#e0e0e0] placeholder:text-[#5c5c5c] transition-colors duration-150 focus:border-[#1D9E75]/70 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/40"
        />
        <ExportButton
          data={data}
          headers={headers}
          disabled={data.length === 0}
        />
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
                  <div className="flex items-center gap-1">
                    <span>{h.label}</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleFilterClick(h.key as keyof POLineItem)}
                        aria-label={`Filter by ${h.label}`}
                        aria-pressed={columnFilter === h.key}
                        className={cn(
                          "rounded p-0.5 transition-colors hover:bg-[#2a2a2a]",
                          columnFilter === h.key && "bg-[#2a2a2a] text-[#1D9E75]"
                        )}
                        title="Filter by column"
                      >
                        <Filter className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSort(h.key as keyof POLineItem)}
                        aria-label={
                          sortKey === h.key
                            ? `Sort ${h.label} ${sortDir === "asc" ? "descending" : "ascending"}`
                            : `Sort by ${h.label}`
                        }
                        aria-pressed={sortKey === h.key}
                        className={cn(
                          "rounded p-0.5 transition-colors hover:bg-[#2a2a2a]",
                          sortKey === h.key && "bg-[#2a2a2a] text-[#1D9E75]"
                        )}
                        title={sortKey === h.key ? `Sort ${sortDir === "asc" ? "descending" : "ascending"}` : "Sort"}
                      >
                        {sortKey === h.key ? (
                          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, rowIndex) => {
              const lowConfidence = typeof row.confidence === "number" && row.confidence < 0.6;
              return (
              <tr
                key={`${row.retailer ?? ""}-${row.po_number ?? ""}-${row.product_code ?? ""}-${rowIndex}`}
                className={cn(
                  "border-t border-[#2a2a2a] transition-colors duration-150 hover:bg-[#141414] [content-visibility:auto] [contain-intrinsic-size:0_34px]",
                  lowConfidence && "bg-amber-500/10"
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
                        isCustName ? "min-w-[140px] text-sm" : "text-sm"
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
