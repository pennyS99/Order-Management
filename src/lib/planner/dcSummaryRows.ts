import type { Shipment } from "@/types/planner";

/** Non-LTL/LCL first by province; LTL/LCL last by province; then stable keys. */
function comparePlannerRowsByProvinceLtlLast(
  a: {
    serviceType: Shipment["serviceType"];
    province: string;
    shipmentId: string;
    dropSequence?: number;
    dcName?: string;
  },
  b: typeof a,
): number {
  const tierA = a.serviceType === "LTL" || a.serviceType === "LCL" ? 1 : 0;
  const tierB = b.serviceType === "LTL" || b.serviceType === "LCL" ? 1 : 0;
  if (tierA !== tierB) return tierA - tierB;
  const p = a.province.localeCompare(b.province, undefined, { sensitivity: "base", numeric: true });
  if (p !== 0) return p;
  const id = a.shipmentId.localeCompare(b.shipmentId, undefined, { numeric: true });
  if (id !== 0) return id;
  const seqA = a.dropSequence ?? 0;
  const seqB = b.dropSequence ?? 0;
  if (seqA !== seqB) return seqA - seqB;
  return (a.dcName ?? "").localeCompare(b.dcName ?? "", undefined, { sensitivity: "base" });
}

function parseDateForOutput(raw: string | undefined): Date | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  // IMPORTANT: Avoid `new Date("YYYY-MM-DD")` timezone-dependent behavior.
  // Normalize date-only strings to a local Date so formatting is stable across runtimes (Vercel/local).
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoDateOnly) {
    const year = Number(isoDateOnly[1]);
    const month = Number(isoDateOnly[2]);
    const day = Number(isoDateOnly[3]);
    const normalized = new Date(year, month - 1, day);
    return Number.isNaN(normalized.getTime()) ? null : normalized;
  }
  const isoSlashDateOnly = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(value);
  if (isoSlashDateOnly) {
    const year = Number(isoSlashDateOnly[1]);
    const month = Number(isoSlashDateOnly[2]);
    const day = Number(isoSlashDateOnly[3]);
    const normalized = new Date(year, month - 1, day);
    return Number.isNaN(normalized.getTime()) ? null : normalized;
  }
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(value);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[2]);
  const yRaw = Number(match[3]);
  const year = yRaw < 100 ? 2000 + yRaw : yRaw;
  const month = a > 12 ? b : a;
  const day = a > 12 ? a : b;
  const normalized = new Date(year, month - 1, day);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

function formatDateDdMmmYy(raw: string | undefined): string {
  const d = parseDateForOutput(raw);
  if (!d) return (raw ?? "").trim();
  const dd = String(d.getDate()).padStart(2, "0");
  const mmm = d.toLocaleString("en-US", { month: "short" }).toLowerCase();
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mmm}-${yy}`;
}

function summarizePld(lines: Array<{ pld?: string }>): string {
  const uniq = Array.from(new Set(lines.map((line) => formatDateDdMmmYy(line.pld)).filter(Boolean)));
  if (uniq.length === 0) return "—";
  return uniq.length === 1 ? uniq[0]! : "MIXED";
}

function summarizeRad(lines: Array<{ rad?: string }>): string {
  const uniq = Array.from(new Set(lines.map((line) => formatDateDdMmmYy(line.rad)).filter(Boolean)));
  if (uniq.length === 0) return "—";
  return uniq.length === 1 ? uniq[0]! : "MIXED";
}

function summarizePoNumber(lines: Array<{ purchaseOrder: string }>): string {
  const uniq = Array.from(new Set(lines.map((line) => line.purchaseOrder?.trim()).filter(Boolean)));
  if (uniq.length === 0) return "—";
  return uniq.join(", ");
}

function summarizePoExpiredDate(lines: Array<{ poExpiredDate?: string }>): string {
  const uniq = Array.from(new Set(lines.map((line) => formatDateDdMmmYy(line.poExpiredDate)).filter(Boolean)));
  if (uniq.length === 0) return "—";
  return uniq.length === 1 ? uniq[0]! : "MIXED";
}

/** Minutes from midnight → "HH:mm" (hours may exceed 23 on long routes). */
function formatClockMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "—";
  const total = Math.round(m);
  const h = Math.floor(total / 60);
  const min = total % 60;
  return `${h}:${String(min).padStart(2, "0")}`;
}

function formatTripDurationMin(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "—";
  return `${Math.round(m)} min`;
}

export type DcSummaryRow = {
  shipmentId: string;
  truckType: string;
  serviceType: Shipment["serviceType"];
  utilizationPct: number;
  dcName: string;
  origin: string;
  channelType: string;
  province: string;
  totalQty: number;
  totalKg: number;
  totalCbm: number;
  pld: string;
  rad: string;
  poNumber: string;
  poExpiredDate: string;
  dropSequence: number;
  previousDropDc: string | null;
  legFromPreviousKm: number | null;
  legFromPreviousMin: number | null;
  arriveClock: string;
  unloadStartClock: string;
  departClock: string;
  tripDurationMin: number | null;
};

/** One row per DC per shipment (all POs rolled up): province order, LTL/LCL last. */
export function buildDcSummaryRows(shipments: Shipment[]): DcSummaryRow[] {
  const rows: DcSummaryRow[] = [];
  const shipmentSortMeta = new Map<string, { earliestRadTs: number; originDistanceKm: number }>();

  for (const shipment of shipments) {
    let earliestRadTs = Number.POSITIVE_INFINITY;
    for (const order of shipment.orders) {
      const d = parseDateForOutput(order.rad);
      if (!d) continue;
      const ts = d.getTime();
      if (ts < earliestRadTs) earliestRadTs = ts;
    }
    const firstStop = shipment.dropStops.slice().sort((a, b) => a.sequence - b.sequence)[0];
    const originDistanceKm = firstStop?.legFromPreviousKm ?? Number.NEGATIVE_INFINITY;
    shipmentSortMeta.set(shipment.id, { earliestRadTs, originDistanceKm });

    const byDc = new Map<string, typeof shipment.orders>();
    for (const order of shipment.orders) {
      const dc = order.dcName ?? "";
      const list = byDc.get(dc) ?? [];
      list.push(order);
      byDc.set(dc, list);
    }
    const stopByDc = new Map(shipment.dropStops.map((s) => [s.dcName, s]));
    for (const [dcName, lines] of byDc) {
      const first = lines[0];
      if (!first) continue;
      const stop = stopByDc.get(dcName);
      rows.push({
        shipmentId: shipment.id,
        truckType: shipment.truckType,
        serviceType: shipment.serviceType,
        utilizationPct: Math.max(shipment.cbmUtilizationPct, shipment.weightUtilizationPct),
        dcName,
        origin: first.origin?.trim() ?? "",
        channelType: (first as unknown as { channelType?: string }).channelType?.trim?.() ?? "",
        province: first.province?.trim() ?? "",
        totalQty: lines.reduce((acc, o) => acc + o.cases, 0),
        totalKg: lines.reduce((acc, o) => acc + o.totalWeightKg, 0),
        totalCbm: lines.reduce((acc, o) => acc + o.totalCbm, 0),
        pld: summarizePld(lines),
        rad: summarizeRad(lines),
        poNumber: summarizePoNumber(lines),
        poExpiredDate: summarizePoExpiredDate(lines),
        dropSequence: stop?.sequence ?? 0,
        previousDropDc: stop?.previousDcName ?? null,
        legFromPreviousKm: stop?.legFromPreviousKm ?? null,
        legFromPreviousMin: stop?.legFromPreviousMin ?? null,
        arriveClock: formatClockMinutes(stop?.arriveMin),
        unloadStartClock: formatClockMinutes(stop?.unloadStartMin),
        departClock: formatClockMinutes(stop?.departMin),
        tripDurationMin: shipment.tripDurationMin ?? null,
      });
    }
  }

  rows.sort((a, b) => {
    const aMeta = shipmentSortMeta.get(a.shipmentId) ?? {
      earliestRadTs: Number.POSITIVE_INFINITY,
      originDistanceKm: Number.NEGATIVE_INFINITY,
    };
    const bMeta = shipmentSortMeta.get(b.shipmentId) ?? {
      earliestRadTs: Number.POSITIVE_INFINITY,
      originDistanceKm: Number.NEGATIVE_INFINITY,
    };
    if (aMeta.earliestRadTs !== bMeta.earliestRadTs) {
      return aMeta.earliestRadTs - bMeta.earliestRadTs;
    }
    if (aMeta.originDistanceKm !== bMeta.originDistanceKm) {
      return bMeta.originDistanceKm - aMeta.originDistanceKm;
    }
    return comparePlannerRowsByProvinceLtlLast(
      {
        serviceType: a.serviceType,
        province: a.province,
        shipmentId: a.shipmentId,
        dropSequence: a.dropSequence,
        dcName: a.dcName,
      },
      {
        serviceType: b.serviceType,
        province: b.province,
        shipmentId: b.shipmentId,
        dropSequence: b.dropSequence,
        dcName: b.dcName,
      },
    );
  });

  return rows;
}

export function formatTripDurationCell(m: number | null | undefined): string {
  return formatTripDurationMin(m);
}

