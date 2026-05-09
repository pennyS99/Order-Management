"use client";

import { useCallback, useMemo } from "react";

import { TableColumnHeaderControlButtons } from "@/components/po/table-column-header-controls";
import { TableFilterToolbar } from "@/components/po/table-filter-toolbar";
import { useTableFilterSort } from "@/hooks/use-table-filter-sort";
import type { DcSummaryRow } from "@/lib/planner/dcSummaryRows";
import { formatTripDurationCell } from "@/lib/planner/dcSummaryRows";

const COL_IDS = [
  "origin",
  "shipmentId",
  "dropSequence",
  "dcName",
  "poNumber",
  "pld",
  "rad",
  "legKm",
  "legMin",
  "arriveClock",
  "unloadStartClock",
  "departClock",
  "tripDurationMin",
  "totalQty",
  "totalKg",
  "totalCbm",
  "truckType",
  "serviceType",
] as const;

const TH_CLASS =
  "border-b border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]";

function DetailDcHeader({
  id,
  label,
  align = "left",
  activeFilterColumn,
  sortColumn,
  sortDir,
  onFilterClick,
  onSortClick,
}: {
  id: (typeof COL_IDS)[number];
  label: string;
  align?: "left" | "right" | "center";
  activeFilterColumn: string | null;
  sortColumn: string | null;
  sortDir: "asc" | "desc" | null;
  onFilterClick: (columnId: string) => void;
  onSortClick: (columnId: string) => void;
}) {
  return (
    <th className={`${TH_CLASS} ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}>
      <div className={align === "right" ? "flex justify-end" : align === "center" ? "flex justify-center" : ""}>
        <TableColumnHeaderControlButtons
          label={label}
          columnId={id}
          filterActive={activeFilterColumn === id}
          sortActive={sortColumn === id}
          sortDir={sortColumn === id ? sortDir : null}
          onFilterClick={onFilterClick}
          onSortClick={onSortClick}
          variant="slate"
          labelClassName="text-inherit font-semibold uppercase tracking-wide"
        />
      </div>
    </th>
  );
}

export function SavedPlanDetailDcTable({ rows }: { rows: DcSummaryRow[] }) {
  const getColumnText = useCallback((row: DcSummaryRow, columnId: string): string => {
    switch (columnId) {
      case "origin":
        return row.origin ?? "";
      case "shipmentId":
        return row.shipmentId ?? "";
      case "dropSequence":
        return String(row.dropSequence);
      case "dcName":
        return row.dcName ?? "";
      case "poNumber":
        return row.poNumber ?? "";
      case "pld":
        return row.pld ?? "";
      case "rad":
        return row.rad ?? "";
      case "legKm":
        return row.legFromPreviousKm != null ? String(row.legFromPreviousKm) : "";
      case "legMin":
        return row.legFromPreviousMin != null ? String(row.legFromPreviousMin) : "";
      case "arriveClock":
        return row.arriveClock ?? "";
      case "unloadStartClock":
        return row.unloadStartClock ?? "";
      case "departClock":
        return row.departClock ?? "";
      case "tripDurationMin":
        return row.tripDurationMin != null ? String(row.tripDurationMin) : "";
      case "totalQty":
        return String(row.totalQty);
      case "totalKg":
        return String(row.totalKg);
      case "totalCbm":
        return String(row.totalCbm);
      case "truckType":
        return row.truckType ?? "";
      case "serviceType":
        return row.serviceType ?? "";
      default:
        return "";
    }
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
  } = useTableFilterSort(rows, {
    columnIds: COL_IDS as unknown as string[],
    getColumnText,
  });

  const filterPlaceholder = useMemo(() => {
    if (!activeFilterColumn) return "Search DC stops...";
    return `Search ${activeFilterColumn}...`;
  }, [activeFilterColumn]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2.5">
        <h3 className="text-sm font-semibold text-[var(--text)]">DC stops</h3>
        <p className="mt-0.5 text-xs text-[var(--om-text-muted)]">
          {displayRows.length} row{displayRows.length === 1 ? "" : "s"} shown
        </p>
      </div>
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
        <TableFilterToolbar
          id="saved-plan-detail-dc-filter"
          value={filterText}
          onChange={setFilterText}
          placeholder={filterPlaceholder}
          className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--om-text-muted)] focus:border-[color-mix(in_oklch,var(--primary)_55%,var(--border))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--primary)_35%,transparent)]"
        />
      </div>
      <div className="max-h-[28rem] overflow-auto">
        <table className="min-w-full font-sans whitespace-nowrap text-sm text-[var(--text)]">
          <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface-elevated)] shadow-sm shadow-black/5">
            <tr>
              <th className={TH_CLASS}>No.</th>
              <DetailDcHeader id="origin" label="Origin" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="shipmentId" label="Shipment ID" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="dropSequence" label="Drop #" align="right" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="dcName" label="DC Name" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="poNumber" label="PO Number" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="pld" label="PLD" align="center" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="rad" label="RAD" align="center" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="legKm" label="Drive km" align="right" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="legMin" label="Drive min" align="right" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="arriveClock" label="Arrive" align="right" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="unloadStartClock" label="Unload start" align="right" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="departClock" label="Depart" align="right" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="tripDurationMin" label="Trip duration" align="right" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="totalQty" label="Qty" align="right" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="totalKg" label="KG" align="right" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="totalCbm" label="CBM" align="right" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="truckType" label="Truck Type" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
              <DetailDcHeader id="serviceType" label="Service" activeFilterColumn={activeFilterColumn} sortColumn={sortColumn} sortDir={sortDir} onFilterClick={toggleFilterColumn} onSortClick={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => (
              <tr key={`${row.shipmentId}-${row.dcName}-${index}`}>
                <td className="border-t border-[var(--border)] px-2 py-2">{index + 1}</td>
                <td className="border-t border-[var(--border)] px-2 py-2">{row.origin || "—"}</td>
                <td className="border-t border-[var(--border)] px-2 py-2 font-sans text-[13px] font-medium tabular-nums tracking-[-0.02em] text-[var(--text)] antialiased">
                  {row.shipmentId}
                </td>
                <td className="border-t border-[var(--border)] px-2 py-2 text-right tabular-nums">
                  {row.dropSequence > 0 ? row.dropSequence : "—"}
                </td>
                <td className="border-t border-[var(--border)] px-2 py-2">{row.dcName}</td>
                <td className="border-t border-[var(--border)] px-2 py-2 font-mono text-[13px]">{row.poNumber}</td>
                <td className="border-t border-[var(--border)] px-2 py-2 text-center">{row.pld}</td>
                <td className="border-t border-[var(--border)] px-2 py-2 text-center">{row.rad}</td>
                <td className="border-t border-[var(--border)] px-2 py-2 text-right tabular-nums">
                  {row.legFromPreviousKm != null ? row.legFromPreviousKm.toFixed(1) : "—"}
                </td>
                <td className="border-t border-[var(--border)] px-2 py-2 text-right tabular-nums">
                  {row.legFromPreviousMin != null ? Math.round(row.legFromPreviousMin) : "—"}
                </td>
                <td className="border-t border-[var(--border)] px-2 py-2 text-right tabular-nums">{row.arriveClock}</td>
                <td className="border-t border-[var(--border)] px-2 py-2 text-right tabular-nums">{row.unloadStartClock}</td>
                <td className="border-t border-[var(--border)] px-2 py-2 text-right tabular-nums">{row.departClock}</td>
                <td className="border-t border-[var(--border)] px-2 py-2 text-right tabular-nums">
                  {formatTripDurationCell(row.tripDurationMin)}
                </td>
                <td className="border-t border-[var(--border)] px-2 py-2 text-right tabular-nums">{row.totalQty}</td>
                <td className="border-t border-[var(--border)] px-2 py-2 text-right tabular-nums">{row.totalKg.toFixed(2)}</td>
                <td className="border-t border-[var(--border)] px-2 py-2 text-right tabular-nums">{row.totalCbm.toFixed(2)}</td>
                <td className="border-t border-[var(--border)] px-2 py-2">{row.truckType}</td>
                <td className="border-t border-[var(--border)] px-2 py-2">{row.serviceType}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="border-t border-[var(--border)] px-2 py-6 text-center text-xs text-[#888888]" colSpan={19}>
                  No rows for this tab.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
