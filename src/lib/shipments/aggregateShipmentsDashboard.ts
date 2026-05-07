import type { SavedShipmentTableRow } from "@/components/planner/ShipmentsSavedPlansTable";

function planIdFromRow(shipmentId: string): string {
  const i = shipmentId.indexOf("::");
  return i >= 0 ? shipmentId.slice(0, i) : "";
}

function bumpCount(map: Map<string, number>, key: string, delta = 1) {
  const k = key.trim() || "—";
  map.set(k, (map.get(k) ?? 0) + delta);
}

function topEntries(map: Map<string, number>, n: number): { label: string; count: number }[] {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export function aggregateShipmentsDashboard(rows: SavedShipmentTableRow[]) {
  const planIds = new Set<string>();
  const shipmentKeys = new Set<string>();
  const truckMap = new Map<string, number>();
  const serviceMap = new Map<string, number>();
  const dcMap = new Map<string, number>();
  const originMap = new Map<string, number>();
  let totalQty = 0;
  let totalKg = 0;
  let totalCbm = 0;
  let stopsWithTimingGap = 0;

  for (const row of rows) {
    const pid = planIdFromRow(row.shipmentId);
    if (pid) planIds.add(pid);
    shipmentKeys.add(row.shipmentId);
    bumpCount(truckMap, row.truckType);
    bumpCount(serviceMap, row.serviceType);
    bumpCount(dcMap, row.dcName);
    bumpCount(originMap, row.origin || "—");
    totalQty += row.totalQty;
    totalKg += row.totalKg;
    totalCbm += row.totalCbm;
    if (row.arriveClock === "—" || row.departClock === "—") stopsWithTimingGap += 1;
  }

  const maxDc = topEntries(dcMap, 1)[0]?.count ?? 1;
  const maxOrigin = topEntries(originMap, 1)[0]?.count ?? 1;
  const maxService = topEntries(serviceMap, 1)[0]?.count ?? 1;

  return {
    planCount: planIds.size,
    routedShipmentCount: shipmentKeys.size,
    stopCount: rows.length,
    totalQty,
    totalKg,
    totalCbm,
    stopsWithTimingGap,
    topDc: topEntries(dcMap, 5),
    topOrigin: topEntries(originMap, 5),
    serviceBreakdown: topEntries(serviceMap, 6),
    truckBreakdown: topEntries(truckMap, 5),
    maxDc,
    maxOrigin,
    maxService,
  };
}

