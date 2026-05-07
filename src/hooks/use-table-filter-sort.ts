"use client";

import { useCallback, useMemo, useState } from "react";

export type TableSortDirection = "asc" | "desc";

export type TableFilterSortOptions<T> = {
  /** Stable ordered column ids used for global search concatenation. */
  columnIds: readonly string[];
  /** Text used for filtering and sorting a column. */
  getColumnText: (row: T, columnId: string) => string;
  /** When no column filter is active, search this combined string (defaults to all columns joined). */
  getGlobalSearchText?: (row: T) => string;
};

/**
 * PO Extract–style filtering: optional column scope + global text; sorting by column string (numeric-aware localeCompare).
 */
export function useTableFilterSort<T>(rows: readonly T[], options: TableFilterSortOptions<T>) {
  const { columnIds, getColumnText, getGlobalSearchText } = options;

  const [filterText, setFilterText] = useState("");
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<TableSortDirection>("asc");

  const defaultGlobal = useCallback(
    (row: T) => columnIds.map((id) => getColumnText(row, id)).join(" "),
    [columnIds, getColumnText],
  );

  const globalFn = getGlobalSearchText ?? defaultGlobal;

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return [...rows];
    if (activeFilterColumn) {
      return rows.filter((r) => getColumnText(r, activeFilterColumn).toLowerCase().includes(q));
    }
    return rows.filter((r) => globalFn(r).toLowerCase().includes(q));
  }, [rows, filterText, activeFilterColumn, getColumnText, globalFn]);

  const displayRows = useMemo(() => {
    if (!sortColumn) return filteredRows;
    const out = [...filteredRows];
    out.sort((a, b) => {
      const va = getColumnText(a, sortColumn);
      const vb = getColumnText(b, sortColumn);
      const cmp = va.localeCompare(vb, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [filteredRows, sortColumn, sortDir, getColumnText]);

  const toggleSort = useCallback((columnId: string) => {
    setSortColumn((prev) => {
      if (prev === columnId) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return columnId;
    });
  }, []);

  const toggleFilterColumn = useCallback((columnId: string) => {
    setActiveFilterColumn((prev) => (prev === columnId ? null : columnId));
  }, []);

  return {
    filterText,
    setFilterText,
    activeFilterColumn,
    setActiveFilterColumn,
    sortColumn,
    sortDir,
    displayRows,
    toggleSort,
    toggleFilterColumn,
  };
}
