"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { Map } from "lucide-react";

import { TableColumnHeaderControlButtons } from "@/components/po/table-column-header-controls";
import { TableFilterToolbar } from "@/components/po/table-filter-toolbar";
import { useTableFilterSort } from "@/hooks/use-table-filter-sort";
import type { DcSummaryRow } from "@/lib/planner/dcSummaryRows";

export type SavedShipmentTableRow = DcSummaryRow & { savedPlanName: string };

function planIdFromPrefixedShipmentId(shipmentId: string): string {
  const i = shipmentId.indexOf("::");
  return i >= 0 ? shipmentId.slice(0, i) : "";
}

/** Stored search rows use `planId::<routed shipment id>`; the routed id is the consolidation label (e.g. WESTJAVA-CDE-0010). */
function displayRoutedShipmentId(prefixedShipmentId: string): string {
  const i = prefixedShipmentId.indexOf("::");
  return i >= 0 ? prefixedShipmentId.slice(i + 2) : prefixedShipmentId;
}

const SHIPMENTS_TABLE_COL_IDS = [
  "savedPlan",
  "origin",
  "shipmentId",
  "drop",
  "dc",
  "pld",
  "rad",
  "driveKm",
  "driveMin",
  "arrive",
  "unloadStart",
  "depart",
  "tripDur",
  "qty",
  "kg",
  "cbm",
  "truck",
  "service",
  "plan",
] as const;

export function ShipmentsSavedPlansTable({ rows }: { rows: SavedShipmentTableRow[] }) {
  const getColumnText = useCallback((row: SavedShipmentTableRow, columnId: string): string => {
    const planId = planIdFromPrefixedShipmentId(row.shipmentId);
    switch (columnId) {
      case "savedPlan":
        return row.savedPlanName ?? "";
      case "origin":
        return row.origin ?? "";
      case "shipmentId":
        return displayRoutedShipmentId(row.shipmentId);
      case "drop":
        return String(row.dropSequence > 0 ? row.dropSequence : "");
      case "dc":
        return row.dcName ?? "";
      case "pld":
        return row.pld ?? "";
      case "rad":
        return row.rad ?? "";
      case "driveKm":
        return row.legFromPreviousKm != null ? String(row.legFromPreviousKm) : "";
      case "driveMin":
        return row.legFromPreviousMin != null ? String(row.legFromPreviousMin) : "";
      case "arrive":
        return row.arriveClock ?? "";
      case "unloadStart":
        return row.unloadStartClock ?? "";
      case "depart":
        return row.departClock ?? "";
      case "tripDur":
        return row.tripDurationMin != null ? String(row.tripDurationMin) : "";
      case "qty":
        return String(row.totalQty);
      case "kg":
        return String(row.totalKg);
      case "cbm":
        return String(row.totalCbm);
      case "truck":
        return row.truckType ?? "";
      case "service":
        return row.serviceType ?? "";
      case "plan":
        return planId;
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
    columnIds: SHIPMENTS_TABLE_COL_IDS as unknown as string[],
    getColumnText,
  });

  const filterPlaceholder = useMemo(() => {
    if (!activeFilterColumn) return "Filter...";
    const labels: Record<string, string> = {
      savedPlan: "Saved plan",
      origin: "Origin",
      shipmentId: "Shipment ID",
      drop: "Drop #",
      dc: "DC name",
      pld: "PLD",
      rad: "RAD",
      driveKm: "Drive km",
      driveMin: "Drive min",
      arrive: "Arrive",
      unloadStart: "Unload start",
      depart: "Depart",
      tripDur: "Trip duration",
      qty: "Qty",
      kg: "KG",
      cbm: "CBM",
      truck: "Truck type",
      service: "Service",
      plan: "Plan",
    };
    return `Filter ${labels[activeFilterColumn] ?? activeFilterColumn}...`;
  }, [activeFilterColumn]);

  const thBase =
    "border-b border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-[#888888]";

  return (
    <div className="space-y-6 font-sans antialiased">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-[#e0e0e0] md:text-2xl">
            Shipments
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#888888]">
            Every shipment stop from all saved plans (same detail as search). Open the parent plan for full context.
          </p>
        </div>
        <Link
          href="/shipments/map"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-2.5 text-sm font-semibold text-[#e0e0e0] transition-colors hover:border-[#1D9E75]/45 hover:text-[#1D9E75]"
        >
          <Map className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
          Shipments map
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#0d0d0d]">
        <div className="border-b border-[#2a2a2a] bg-[#151515] px-4 py-2.5">
          <h2 className="text-sm font-semibold text-[#e0e0e0]">Saved shipments</h2>
          <p className="mt-0.5 text-xs leading-snug text-[#888888]">
            {displayRows.length} row{displayRows.length === 1 ? "" : "s"} shown · one row per DC stop per shipment
          </p>
        </div>
        <div className="border-b border-[#2a2a2a] bg-[#141414] px-3 py-2">
          <TableFilterToolbar
            id="shipments-saved-filter"
            value={filterText}
            onChange={setFilterText}
            placeholder={filterPlaceholder}
            className="w-full max-w-md rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-1.5 text-sm text-[#e0e0e0] placeholder:text-[#666] focus:border-[#1D9E75]/70 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/40"
          />
        </div>
        <div className="om-results-table-scroll max-h-[min(70vh,720px)] overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 whitespace-nowrap text-xs leading-normal text-[#e0e0e0]">
            <thead className="sticky top-0 z-10 [&_th]:bg-[#1a1a1a]">
              <tr>
                <th className={thBase}>No.</th>
                <th className={thBase}>
                  <TableColumnHeaderControlButtons
                    label="Saved plan"
                    columnId="savedPlan"
                    filterActive={activeFilterColumn === "savedPlan"}
                    sortActive={sortColumn === "savedPlan"}
                    sortDir={sortColumn === "savedPlan" ? sortDir : null}
                    onFilterClick={toggleFilterColumn}
                    onSortClick={toggleSort}
                    variant="po"
                    labelClassName="text-inherit font-bold uppercase tracking-wider"
                  />
                </th>
                <th className={thBase}>
                  <TableColumnHeaderControlButtons
                    label="Origin"
                    columnId="origin"
                    filterActive={activeFilterColumn === "origin"}
                    sortActive={sortColumn === "origin"}
                    sortDir={sortColumn === "origin" ? sortDir : null}
                    onFilterClick={toggleFilterColumn}
                    onSortClick={toggleSort}
                    variant="po"
                    labelClassName="text-inherit font-bold uppercase tracking-wider"
                  />
                </th>
                <th className={thBase}>
                  <TableColumnHeaderControlButtons
                    label="Shipment ID"
                    columnId="shipmentId"
                    filterActive={activeFilterColumn === "shipmentId"}
                    sortActive={sortColumn === "shipmentId"}
                    sortDir={sortColumn === "shipmentId" ? sortDir : null}
                    onFilterClick={toggleFilterColumn}
                    onSortClick={toggleSort}
                    variant="po"
                    labelClassName="text-inherit font-bold uppercase tracking-wider"
                  />
                </th>
                <th className={`${thBase} text-right`}>
                  <div className="flex justify-end">
                    <TableColumnHeaderControlButtons
                      label="Drop #"
                      columnId="drop"
                      filterActive={activeFilterColumn === "drop"}
                      sortActive={sortColumn === "drop"}
                      sortDir={sortColumn === "drop" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
                <th className={thBase}>
                  <TableColumnHeaderControlButtons
                    label="DC name"
                    columnId="dc"
                    filterActive={activeFilterColumn === "dc"}
                    sortActive={sortColumn === "dc"}
                    sortDir={sortColumn === "dc" ? sortDir : null}
                    onFilterClick={toggleFilterColumn}
                    onSortClick={toggleSort}
                    variant="po"
                    labelClassName="text-inherit font-bold uppercase tracking-wider"
                  />
                </th>
                <th className={`${thBase} text-center`}>
                  <div className="flex justify-center">
                    <TableColumnHeaderControlButtons
                      label="PLD"
                      columnId="pld"
                      filterActive={activeFilterColumn === "pld"}
                      sortActive={sortColumn === "pld"}
                      sortDir={sortColumn === "pld" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
                <th className={`${thBase} text-center`}>
                  <div className="flex justify-center">
                    <TableColumnHeaderControlButtons
                      label="RAD"
                      columnId="rad"
                      filterActive={activeFilterColumn === "rad"}
                      sortActive={sortColumn === "rad"}
                      sortDir={sortColumn === "rad" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
                <th className={`${thBase} text-right`}>
                  <div className="flex justify-end">
                    <TableColumnHeaderControlButtons
                      label="Drive km"
                      columnId="driveKm"
                      filterActive={activeFilterColumn === "driveKm"}
                      sortActive={sortColumn === "driveKm"}
                      sortDir={sortColumn === "driveKm" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
                <th className={`${thBase} text-right`}>
                  <div className="flex justify-end">
                    <TableColumnHeaderControlButtons
                      label="Drive min"
                      columnId="driveMin"
                      filterActive={activeFilterColumn === "driveMin"}
                      sortActive={sortColumn === "driveMin"}
                      sortDir={sortColumn === "driveMin" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
                <th className={`${thBase} text-right`}>
                  <div className="flex justify-end">
                    <TableColumnHeaderControlButtons
                      label="Arrive"
                      columnId="arrive"
                      filterActive={activeFilterColumn === "arrive"}
                      sortActive={sortColumn === "arrive"}
                      sortDir={sortColumn === "arrive" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
                <th className={`${thBase} text-right`}>
                  <div className="flex justify-end">
                    <TableColumnHeaderControlButtons
                      label="Unload start"
                      columnId="unloadStart"
                      filterActive={activeFilterColumn === "unloadStart"}
                      sortActive={sortColumn === "unloadStart"}
                      sortDir={sortColumn === "unloadStart" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
                <th className={`${thBase} text-right`}>
                  <div className="flex justify-end">
                    <TableColumnHeaderControlButtons
                      label="Depart"
                      columnId="depart"
                      filterActive={activeFilterColumn === "depart"}
                      sortActive={sortColumn === "depart"}
                      sortDir={sortColumn === "depart" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
                <th className={`${thBase} text-right`}>
                  <div className="flex justify-end">
                    <TableColumnHeaderControlButtons
                      label="Trip duration"
                      columnId="tripDur"
                      filterActive={activeFilterColumn === "tripDur"}
                      sortActive={sortColumn === "tripDur"}
                      sortDir={sortColumn === "tripDur" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
                <th className={`${thBase} text-right`}>
                  <div className="flex justify-end">
                    <TableColumnHeaderControlButtons
                      label="Qty"
                      columnId="qty"
                      filterActive={activeFilterColumn === "qty"}
                      sortActive={sortColumn === "qty"}
                      sortDir={sortColumn === "qty" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
                <th className={`${thBase} text-right`}>
                  <div className="flex justify-end">
                    <TableColumnHeaderControlButtons
                      label="KG"
                      columnId="kg"
                      filterActive={activeFilterColumn === "kg"}
                      sortActive={sortColumn === "kg"}
                      sortDir={sortColumn === "kg" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
                <th className={`${thBase} text-right`}>
                  <div className="flex justify-end">
                    <TableColumnHeaderControlButtons
                      label="CBM"
                      columnId="cbm"
                      filterActive={activeFilterColumn === "cbm"}
                      sortActive={sortColumn === "cbm"}
                      sortDir={sortColumn === "cbm" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
                <th className={thBase}>
                  <TableColumnHeaderControlButtons
                    label="Truck type"
                    columnId="truck"
                    filterActive={activeFilterColumn === "truck"}
                    sortActive={sortColumn === "truck"}
                    sortDir={sortColumn === "truck" ? sortDir : null}
                    onFilterClick={toggleFilterColumn}
                    onSortClick={toggleSort}
                    variant="po"
                    labelClassName="text-inherit font-bold uppercase tracking-wider"
                  />
                </th>
                <th className={thBase}>
                  <TableColumnHeaderControlButtons
                    label="Service"
                    columnId="service"
                    filterActive={activeFilterColumn === "service"}
                    sortActive={sortColumn === "service"}
                    sortDir={sortColumn === "service" ? sortDir : null}
                    onFilterClick={toggleFilterColumn}
                    onSortClick={toggleSort}
                    variant="po"
                    labelClassName="text-inherit font-bold uppercase tracking-wider"
                  />
                </th>
                <th className={`${thBase} text-right`}>
                  <div className="flex justify-end">
                    <TableColumnHeaderControlButtons
                      label="Plan"
                      columnId="plan"
                      filterActive={activeFilterColumn === "plan"}
                      sortActive={sortColumn === "plan"}
                      sortDir={sortColumn === "plan" ? sortDir : null}
                      onFilterClick={toggleFilterColumn}
                      onSortClick={toggleSort}
                      variant="po"
                      labelClassName="text-inherit font-bold uppercase tracking-wider"
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, index) => {
                const planId = planIdFromPrefixedShipmentId(row.shipmentId);
                const routedId = displayRoutedShipmentId(row.shipmentId);
                return (
                  <tr
                    key={`${row.shipmentId}-${row.dcName}-${index}`}
                    className="border-t border-[#2a2a2a] transition-colors hover:bg-[#141414]"
                  >
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-[#a3a3a3]">{index + 1}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2">{row.savedPlanName || "—"}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2">{row.origin || "—"}</td>
                    <td
                      className="max-w-[220px] truncate border-t border-[#2a2a2a] px-3 py-2 font-mono text-[12px] text-[#e0e0e0]"
                      title={row.shipmentId !== routedId ? `${routedId} (${row.shipmentId})` : routedId}
                    >
                      {routedId}
                    </td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-right tabular-nums">
                      {row.dropSequence > 0 ? row.dropSequence : "—"}
                    </td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2">{row.dcName}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-center">{row.pld}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-center">{row.rad}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-right tabular-nums">
                      {row.legFromPreviousKm != null ? row.legFromPreviousKm.toFixed(1) : "—"}
                    </td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-right tabular-nums">
                      {row.legFromPreviousMin != null ? Math.round(row.legFromPreviousMin) : "—"}
                    </td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-right tabular-nums">{row.arriveClock}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-right tabular-nums">{row.unloadStartClock}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-right tabular-nums">{row.departClock}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-right tabular-nums">
                      {row.tripDurationMin != null ? `${Math.round(row.tripDurationMin)} min` : "—"}
                    </td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-right tabular-nums">{row.totalQty}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-right tabular-nums">{row.totalKg.toFixed(2)}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-right tabular-nums">{row.totalCbm.toFixed(2)}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2">{row.truckType}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2">{row.serviceType}</td>
                    <td className="border-t border-[#2a2a2a] px-3 py-2 text-right">
                      {planId ? (
                        <Link
                          href={`/planner/saved/${encodeURIComponent(planId)}`}
                          className="inline-flex rounded-md border border-[#333] bg-[#1e1e1e] px-2 py-1 text-xs font-semibold text-[#1D9E75] hover:bg-[#252525]"
                        >
                          Open
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="border-t border-[#2a2a2a] px-3 py-10 text-center text-sm leading-relaxed text-[#888888]" colSpan={20}>
                    No saved shipments yet. Save a plan from the planner, or open{" "}
                    <Link href="/planner" className="font-semibold text-[#1D9E75] underline-offset-2 hover:underline">
                      Planner
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
