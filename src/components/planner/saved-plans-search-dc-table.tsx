"use client";

import { useCallback, useMemo } from "react";

import { TableColumnHeaderControlButtons } from "@/components/po/table-column-header-controls";
import { TableFilterToolbar } from "@/components/po/table-filter-toolbar";
import { useTableFilterSort } from "@/hooks/use-table-filter-sort";

export type SavedPlansSearchRow = {
  savedPlanName: string;
  shipmentId: string;
  truckType: string;
  serviceType: string;
  dcName: string;
  poNumber: string;
  pld: string;
  rad: string;
  legFromPreviousKm: number | null;
  legFromPreviousMin: number | null;
  arriveClock: string;
  unloadStartClock: string;
  departClock: string;
  tripDurationMin: number | null;
  totalQty: number;
  totalKg: number;
  totalCbm: number;
  dropSequence: number;
  origin: string;
};

const COL_IDS = [
  "savedPlanName",
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

export function SavedPlansSearchDcTable({
  rows,
  tableMaxHeightClassName,
}: {
  rows: SavedPlansSearchRow[];
  tableMaxHeightClassName?: string;
}) {
  const getColumnText = useCallback((row: SavedPlansSearchRow, columnId: string): string => {
    switch (columnId) {
      case "savedPlanName":
        return row.savedPlanName ?? "";
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
    if (!activeFilterColumn) return "Filter...";
    const labels: Record<string, string> = Object.fromEntries(
      COL_IDS.map((id) => [id, id.replace(/([A-Z])/g, " $1").trim()]),
    );
    return `Filter ${labels[activeFilterColumn] ?? activeFilterColumn}...`;
  }, [activeFilterColumn]);

  const th = "border-b border-zinc-800 bg-[#151515] px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-200";

  const Header = ({
    id,
    label,
    align = "left",
  }: {
    id: (typeof COL_IDS)[number];
    label: string;
    align?: "left" | "right" | "center";
  }) => (
    <th className={`${th} ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}>
      <div className={align === "right" ? "flex justify-end" : align === "center" ? "flex justify-center" : ""}>
        <TableColumnHeaderControlButtons
          label={label}
          columnId={id}
          filterActive={activeFilterColumn === id}
          sortActive={sortColumn === id}
          sortDir={sortColumn === id ? sortDir : null}
          onFilterClick={toggleFilterColumn}
          onSortClick={toggleSort}
          variant="slate"
          labelClassName="text-inherit font-semibold uppercase tracking-wide"
        />
      </div>
    </th>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0d0d]">
      <div className="border-b border-zinc-800 bg-[#151515] px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-100">By DC</h3>
        <p className="mt-0.5 text-xs text-[#888888]">
          {displayRows.length} row{displayRows.length === 1 ? "" : "s"} shown
        </p>
      </div>
      <div className="border-b border-zinc-800 bg-[#141414] px-3 py-2">
        <TableFilterToolbar
          id="saved-plans-search-dc-filter"
          value={filterText}
          onChange={setFilterText}
          placeholder={filterPlaceholder}
          className="w-full max-w-md rounded-lg border border-zinc-700 bg-[#0d0d0d] px-3 py-1.5 text-xs text-slate-200 placeholder:text-zinc-600 focus:border-[#1D9E75]/70 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/40"
        />
      </div>
      <div className={`overflow-auto ${tableMaxHeightClassName ?? "max-h-[28rem]"}`}>
        <table className="min-w-full whitespace-nowrap text-sm text-slate-200">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={th}>No.</th>
              <Header id="savedPlanName" label="Saved Plan" />
              <Header id="origin" label="Origin" />
              <Header id="shipmentId" label="Shipment ID" />
              <Header id="dropSequence" label="Drop #" align="right" />
              <Header id="dcName" label="DC Name" />
              <Header id="poNumber" label="PO Number" />
              <Header id="pld" label="PLD" align="center" />
              <Header id="rad" label="RAD" align="center" />
              <Header id="legKm" label="Drive km" align="right" />
              <Header id="legMin" label="Drive min" align="right" />
              <Header id="arriveClock" label="Arrive" align="right" />
              <Header id="unloadStartClock" label="Unload start" align="right" />
              <Header id="departClock" label="Depart" align="right" />
              <Header id="tripDurationMin" label="Trip duration" align="right" />
              <Header id="totalQty" label="Qty" align="right" />
              <Header id="totalKg" label="KG" align="right" />
              <Header id="totalCbm" label="CBM" align="right" />
              <Header id="truckType" label="Truck Type" />
              <Header id="serviceType" label="Service" />
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => (
              <tr key={`${row.shipmentId}-${row.dcName}-${index}`}>
                <td className="border-t border-zinc-800/90 px-2 py-2">{index + 1}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2">{row.savedPlanName || "—"}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2">{row.origin || "—"}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2">{row.shipmentId}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2 text-right tabular-nums">
                  {row.dropSequence > 0 ? row.dropSequence : "—"}
                </td>
                <td className="border-t border-zinc-800/90 px-2 py-2">{row.dcName}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2">{row.poNumber}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2 text-center">{row.pld}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2 text-center">{row.rad}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2 text-right tabular-nums">
                  {row.legFromPreviousKm != null ? row.legFromPreviousKm.toFixed(1) : "—"}
                </td>
                <td className="border-t border-zinc-800/90 px-2 py-2 text-right tabular-nums">
                  {row.legFromPreviousMin != null ? Math.round(row.legFromPreviousMin) : "—"}
                </td>
                <td className="border-t border-zinc-800/90 px-2 py-2 text-right tabular-nums">{row.arriveClock}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2 text-right tabular-nums">{row.unloadStartClock}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2 text-right tabular-nums">{row.departClock}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2 text-right tabular-nums">
                  {row.tripDurationMin != null ? `${Math.round(row.tripDurationMin)} min` : "—"}
                </td>
                <td className="border-t border-zinc-800/90 px-2 py-2 text-right tabular-nums">{row.totalQty}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2 text-right tabular-nums">{row.totalKg.toFixed(2)}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2 text-right tabular-nums">{row.totalCbm.toFixed(2)}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2">{row.truckType}</td>
                <td className="border-t border-zinc-800/90 px-2 py-2">{row.serviceType}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="border-t border-zinc-800/90 px-2 py-6 text-center text-xs text-[#888888]" colSpan={20}>
                  No matches for the current filters.
                </td>
              </tr>
            )}
            {rows.length > 0 && displayRows.length === 0 && (
              <tr>
                <td className="border-t border-zinc-800/90 px-2 py-6 text-center text-xs text-[#888888]" colSpan={20}>
                  No rows match this filter. Clear the filter or adjust column scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
