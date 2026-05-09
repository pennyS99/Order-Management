"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo } from "react";
import { Map } from "lucide-react";

import { TableColumnHeaderControlButtons } from "@/components/po/table-column-header-controls";
import { TableFilterToolbar } from "@/components/po/table-filter-toolbar";
import { useTableFilterSort } from "@/hooks/use-table-filter-sort";
import type { DcSummaryRow } from "@/lib/planner/dcSummaryRows";
import { cn } from "@/lib/po/utils";

export type SavedShipmentTableRow = DcSummaryRow & { savedPlanName: string };

export type ShipmentsSavedPlansTableVariant = "full" | "dashboard";

export type ShipmentsSavedPlansTableProps = {
  rows: SavedShipmentTableRow[];
  /** `dashboard` trims columns and chrome for the overview grid. */
  variant?: ShipmentsSavedPlansTableVariant;
  /** Card title inside the table panel (both variants). */
  cardTitle?: string;
  cardDescription?: string;
  /** Max height class for the scrollable table body. */
  tableScrollMaxHeightClass?: string;
  /** Optional external filter control (e.g. header dropdown). */
  externalFilter?: { columnId: ShipmentTableColId; value: string } | null;
  /** Extra class on the outermost wrapper. */
  className?: string;
};

function planIdFromPrefixedShipmentId(shipmentId: string): string {
  const i = shipmentId.indexOf("::");
  return i >= 0 ? shipmentId.slice(0, i) : "";
}

/** Stored search rows use `planId::<routed shipment id>`. */
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
  "channel",
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

type ShipmentTableColId = (typeof SHIPMENTS_TABLE_COL_IDS)[number];

const DASHBOARD_COL_IDS: ShipmentTableColId[] = [
  "savedPlan",
  "shipmentId",
  "dc",
  "channel",
  "drop",
  "arrive",
  "depart",
  "truck",
  "plan",
];

const COLUMN_LABELS: Record<ShipmentTableColId, string> = {
  savedPlan: "Saved plan",
  origin: "Origin",
  shipmentId: "Shipment ID",
  drop: "Drop #",
  dc: "DC name",
  channel: "Channel type",
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

function columnAlign(col: ShipmentTableColId): "left" | "right" | "center" {
  switch (col) {
    case "drop":
    case "driveKm":
    case "driveMin":
    case "arrive":
    case "unloadStart":
    case "depart":
    case "tripDur":
    case "qty":
    case "kg":
    case "cbm":
    case "plan":
      return "right";
    case "pld":
    case "rad":
      return "center";
    default:
      return "left";
  }
}

function SortHeaderCell({
  columnId,
  thBase,
  activeFilterColumn,
  sortColumn,
  sortDir,
  toggleFilterColumn,
  toggleSort,
}: {
  columnId: ShipmentTableColId;
  thBase: string;
  activeFilterColumn: string | null;
  sortColumn: string | null;
  sortDir: "asc" | "desc" | null;
  toggleFilterColumn: (id: string) => void;
  toggleSort: (id: string) => void;
}) {
  const label = COLUMN_LABELS[columnId];
  const align = columnAlign(columnId);
  const controls = (
    <TableColumnHeaderControlButtons
      label={label}
      columnId={columnId}
      filterActive={activeFilterColumn === columnId}
      sortActive={sortColumn === columnId}
      sortDir={sortColumn === columnId ? sortDir : null}
      onFilterClick={toggleFilterColumn}
      onSortClick={toggleSort}
      variant="po"
      labelClassName="text-inherit text-xs font-medium uppercase tracking-wide"
    />
  );

  const thClass = cn(
    thBase,
    align === "right" && "text-right",
    align === "center" && "text-center",
  );

  if (align === "right") {
    return (
      <th className={thClass}>
        <div className="flex justify-end">{controls}</div>
      </th>
    );
  }
  if (align === "center") {
    return (
      <th className={thClass}>
        <div className="flex justify-center">{controls}</div>
      </th>
    );
  }
  return <th className={thClass}>{controls}</th>;
}

function BodyCell({
  columnId,
  row,
  routedId,
  planId,
}: {
  columnId: ShipmentTableColId;
  row: SavedShipmentTableRow;
  routedId: string;
  planId: string;
}) {
  const tdBase = "border-t border-[var(--border)] px-2 py-1.5 text-sm text-[var(--text)]";

  switch (columnId) {
    case "savedPlan":
      return <td className={tdBase}>{row.savedPlanName || "—"}</td>;
    case "origin":
      return <td className={tdBase}>{row.origin || "—"}</td>;
    case "shipmentId":
      return (
        <td
          className={cn(
            tdBase,
            "max-w-[min(280px,36vw)] truncate font-sans text-[13px] font-medium tabular-nums tracking-[-0.02em] text-[var(--text)] antialiased",
          )}
          title={row.shipmentId !== routedId ? `${routedId} (${row.shipmentId})` : routedId}
        >
          {routedId}
        </td>
      );
    case "drop":
      return (
        <td className={cn(tdBase, "text-right tabular-nums")}>
          {row.dropSequence > 0 ? row.dropSequence : "—"}
        </td>
      );
    case "dc":
      return <td className={tdBase}>{row.dcName}</td>;
    case "channel":
      return <td className={tdBase}>{row.channelType?.trim() ? row.channelType : "—"}</td>;
    case "pld":
      return <td className={cn(tdBase, "text-center")}>{row.pld}</td>;
    case "rad":
      return <td className={cn(tdBase, "text-center")}>{row.rad}</td>;
    case "driveKm":
      return (
        <td className={cn(tdBase, "text-right tabular-nums")}>
          {row.legFromPreviousKm != null ? row.legFromPreviousKm.toFixed(1) : "—"}
        </td>
      );
    case "driveMin":
      return (
        <td className={cn(tdBase, "text-right tabular-nums")}>
          {row.legFromPreviousMin != null ? Math.round(row.legFromPreviousMin) : "—"}
        </td>
      );
    case "arrive":
      return <td className={cn(tdBase, "text-right tabular-nums")}>{row.arriveClock}</td>;
    case "unloadStart":
      return <td className={cn(tdBase, "text-right tabular-nums")}>{row.unloadStartClock}</td>;
    case "depart":
      return <td className={cn(tdBase, "text-right tabular-nums")}>{row.departClock}</td>;
    case "tripDur":
      return (
        <td className={cn(tdBase, "text-right tabular-nums")}>
          {row.tripDurationMin != null ? `${Math.round(row.tripDurationMin)} min` : "—"}
        </td>
      );
    case "qty":
      return <td className={cn(tdBase, "text-right tabular-nums")}>{row.totalQty}</td>;
    case "kg":
      return <td className={cn(tdBase, "text-right tabular-nums")}>{row.totalKg.toFixed(2)}</td>;
    case "cbm":
      return <td className={cn(tdBase, "text-right tabular-nums")}>{row.totalCbm.toFixed(2)}</td>;
    case "truck":
      return <td className={tdBase}>{row.truckType}</td>;
    case "service":
      return <td className={tdBase}>{row.serviceType}</td>;
    case "plan":
      return (
        <td className={cn(tdBase, "text-right")}>
          {planId ? (
            <Link
              href={`/planner/saved/${encodeURIComponent(planId)}`}
              className="inline-flex rounded-md border border-[var(--border-strong)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-xs font-semibold text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_12%,var(--surface))]"
            >
              Open
            </Link>
          ) : (
            "—"
          )}
        </td>
      );
    default:
      return <td className={tdBase} />;
  }
}

export function ShipmentsSavedPlansTable({
  rows,
  variant = "full",
  cardTitle = "Shipment stops",
  cardDescription,
  tableScrollMaxHeightClass,
  externalFilter = null,
  className,
}: ShipmentsSavedPlansTableProps) {
  const isDashboard = variant === "dashboard";
  const visibleColumns = useMemo<ShipmentTableColId[]>(
    () => (isDashboard ? DASHBOARD_COL_IDS : [...SHIPMENTS_TABLE_COL_IDS]),
    [isDashboard],
  );

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
    setActiveFilterColumn,
    sortColumn,
    sortDir,
    displayRows,
    toggleSort,
    toggleFilterColumn,
  } = useTableFilterSort(rows, {
    columnIds: visibleColumns as unknown as string[],
    getColumnText,
  });

  useEffect(() => {
    if (!externalFilter) {
      return;
    }
    setActiveFilterColumn(externalFilter.columnId);
    setFilterText(externalFilter.value);
  }, [externalFilter, setActiveFilterColumn, setFilterText]);

  const filterPlaceholder = useMemo(() => {
    if (!activeFilterColumn) return "Search shipment stops...";
    return `Search ${COLUMN_LABELS[activeFilterColumn as ShipmentTableColId] ?? activeFilterColumn}...`;
  }, [activeFilterColumn]);

  const defaultDescription =
    cardDescription ??
    `${displayRows.length} row${displayRows.length === 1 ? "" : "s"} shown · one row per DC stop per shipment`;

  const thBase =
    "border-b border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]";

  const scrollClass =
    tableScrollMaxHeightClass ?? (isDashboard ? "max-h-[min(52vh,520px)]" : "max-h-[min(70vh,720px)]");

  const filterId = isDashboard ? "shipments-saved-filter-dashboard" : "shipments-saved-filter";

  const tablePanel = (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-sm">
      <div
        className={cn(
          "border-b border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3",
        )}
      >
        <h2 className="text-sm font-semibold text-[var(--text)]">{cardTitle}</h2>
        <p className="mt-0.5 text-xs leading-snug text-[var(--muted-foreground)]">{defaultDescription}</p>
      </div>
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2">
        <TableFilterToolbar
          id={filterId}
          value={filterText}
          onChange={setFilterText}
          placeholder={filterPlaceholder}
          className={cn(
            "w-full rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
            isDashboard ? "max-w-full" : "max-w-md",
          )}
        />
      </div>
      <div className={cn("om-results-table-scroll overflow-auto", scrollClass)}>
        <table className="min-w-full border-separate border-spacing-0 font-sans whitespace-nowrap text-sm leading-normal text-[var(--text)]">
          <thead className="sticky top-0 z-10 [&_th]:bg-[var(--surface-elevated)]">
            <tr>
              <th className={thBase}>No.</th>
              {visibleColumns.map((col) => (
                <SortHeaderCell
                  key={col}
                  columnId={col}
                  thBase={thBase}
                  activeFilterColumn={activeFilterColumn}
                  sortColumn={sortColumn}
                  sortDir={sortDir}
                  toggleFilterColumn={toggleFilterColumn}
                  toggleSort={toggleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => {
              const planId = planIdFromPrefixedShipmentId(row.shipmentId);
              const routedId = displayRoutedShipmentId(row.shipmentId);
              return (
                <tr
                  key={`${row.shipmentId}-${row.dcName}-${index}`}
                  className="group transition-colors hover:bg-[color-mix(in_oklch,var(--surface-elevated)_40%,transparent)]"
                >
                  <td className="border-t border-[var(--border)] px-2 py-1.5 text-sm tabular-nums text-[var(--muted-foreground)]">
                    {index + 1}
                  </td>
                  {visibleColumns.map((col) => (
                    <BodyCell key={col} columnId={col} row={row} routedId={routedId} planId={planId} />
                  ))}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  className="border-t border-[var(--border)] px-2 py-8 text-center text-sm leading-relaxed text-[var(--muted-foreground)]"
                  colSpan={1 + visibleColumns.length}
                >
                  No saved shipments yet. Save a plan from the planner, or open{" "}
                  <Link
                    href="/planner"
                    className="font-semibold text-[var(--primary)] underline-offset-2 hover:underline"
                  >
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
  );

  if (isDashboard) {
    return <div className={cn("font-sans antialiased", className)}>{tablePanel}</div>;
  }

  return (
    <div className={cn("space-y-4 font-sans antialiased", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight text-[var(--text)] sm:text-xl">
            Shipments
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Review every saved shipment stop and open the source plan for route details.
          </p>
        </div>
        <Link
          href="/shipments/map"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] shadow-sm transition-colors hover:border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] hover:text-[var(--primary)]"
        >
          <Map className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
          Open map
        </Link>
      </div>
      {tablePanel}
    </div>
  );
}
