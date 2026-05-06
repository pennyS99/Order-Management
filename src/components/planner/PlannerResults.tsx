"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx-js-style";
import { Download, Maximize2, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/po/ui/button";
import { cn } from "@/lib/po/utils";
import { usePlannerContext } from "@/context/PlannerContext";
import { usePlannerResultsColumns } from "@/context/PlannerResultsColumnsContext";
import {
  defaultColumnsByTab,
  type PlannerColumnConfig,
  type PlannerResultsTab,
} from "@/lib/planner/results-columns";
import type { SavedPlanOverlapRef, Shipment } from "@/types/planner";
import { SavePlanDialog } from "@/components/planner/SavePlanDialog";

type WarehouseTimeMotionSettingsClient = {
  pickingMp: number;
  pickingRateCasesPerHour: number;
  loadingDock: number;
  loadingRateCasesPerHour: number;
  startPickingTime: string;
  startLoadingTime: string;
};

/** Non-LTL/LCL first by province; LTL/LCL last by province; then stable keys. */
function comparePlannerRowsByProvinceLtlLast(
  a: {
    serviceType: Shipment["serviceType"];
    province: string;
    shipmentId: string;
    dropSequence?: number;
    dcName?: string;
    purchaseOrder?: string;
    item?: string;
  },
  b: typeof a,
  options?: { dropSequenceOrder?: "asc" | "desc" },
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
  if (seqA !== seqB) {
    return options?.dropSequenceOrder === "desc" ? seqB - seqA : seqA - seqB;
  }
  const dc = (a.dcName ?? "").localeCompare(b.dcName ?? "", undefined, { sensitivity: "base" });
  if (dc !== 0) return dc;
  const po = (a.purchaseOrder ?? "").localeCompare(b.purchaseOrder ?? "", undefined, {
    sensitivity: "base",
    numeric: true,
  });
  if (po !== 0) return po;
  return (a.item ?? "").localeCompare(b.item ?? "", undefined, { sensitivity: "base", numeric: true });
}

function clampPositiveInt(n: unknown, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : fallback;
  return v > 0 ? v : fallback;
}

function clampPositiveNumber(n: unknown, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return v > 0 ? v : fallback;
}

const MIN_PICK_LOAD_DURATION_MIN = 30;
const PICK_LOAD_ROUNDING_STEP_MIN = 30;

function roundUpToStepMin(valueMin: number, stepMin: number): number {
  if (!Number.isFinite(valueMin)) return 0;
  const safeStep = stepMin > 0 ? stepMin : 1;
  return Math.ceil(valueMin / safeStep) * safeStep;
}

function applyMinAndRoundUpMin(valueMin: number, minMin: number, stepMin: number): number {
  const minApplied = Math.max(minMin, valueMin);
  return roundUpToStepMin(minApplied, stepMin);
}

/** Minutes from midnight → "HH:mm" (hours may exceed 23 on long routes). */
function formatClockMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "—";
  const total = Math.round(m);
  const h = Math.floor(total / 60);
  const min = total % 60;
  return `${h}:${String(min).padStart(2, "0")}`;
}

function parseTimeHHmmToMinutes(value: string): number | null {
  const raw = value.trim();
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(raw);
  if (!match) return null;
  const [hh, mm] = raw.split(":").map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function formatTripDurationMin(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "—";
  return `${Math.round(m)} min`;
}

function parseDateForOutput(raw: string | undefined): Date | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
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

const EXPORT_DATE_NUM_FMT = "dd-mmm-yy";

/** Excel 1900 date system: serial 1 = 1900-01-01 (UTC calendar); integer = no time-of-day. */
const EXCEL_1900_DATE_SERIAL_ORIGIN_UTC_MS = Date.UTC(1899, 11, 31);

/** Local calendar date at 00:00 (strip time from parsed instants). */
function startOfLocalCalendarDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole-day serial for `numFmt` date columns — avoids float noise (e.g. `0:00:12`) from JS `Date` in SheetJS. */
function localCalendarDateToExcelSerial(d: Date): number {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const utcMidnight = Date.UTC(y, m, day);
  return Math.round((utcMidnight - EXCEL_1900_DATE_SERIAL_ORIGIN_UTC_MS) / 86400000);
}

function toExcelDateCell(raw: string | undefined, fallback: string): number | string {
  const parsed = parseDateForOutput(raw);
  if (parsed) return localCalendarDateToExcelSerial(startOfLocalCalendarDay(parsed));
  const text = (raw ?? "").trim();
  return text || fallback;
}

type PlannerPickLoadScheduleRow = {
  startPickingMin: number | null;
  startLoadingMin: number | null;
  startPickingClock: string;
  pltClock: string;
};

function computePlannerPickLoadSchedule(
  shipments: Shipment[],
  settings: WarehouseTimeMotionSettingsClient,
  shipmentOrderIds?: string[],
): { scheduleByShipmentId: Map<string, PlannerPickLoadScheduleRow>; error: string | null } {
  const pickingMp = clampPositiveInt(settings.pickingMp, 1);
  const loadingDock = clampPositiveInt(settings.loadingDock, 1);
  const pickingRate = clampPositiveNumber(settings.pickingRateCasesPerHour, 0);
  const loadingRate = clampPositiveNumber(settings.loadingRateCasesPerHour, 0);
  const startPickMin = parseTimeHHmmToMinutes(settings.startPickingTime);
  const startLoadMin = parseTimeHHmmToMinutes(settings.startLoadingTime);

  if (pickingRate <= 0 || loadingRate <= 0) {
    return {
      scheduleByShipmentId: new Map(),
      error: "Warehouse Time Motion rates must be > 0 to compute picking/loading times.",
    };
  }
  if (startPickMin === null || startLoadMin === null) {
    return {
      scheduleByShipmentId: new Map(),
      error: "Warehouse Time Motion start times must use HH:mm format.",
    };
  }

  // Enforce 30-min rounding for schedule start anchors.
  const roundedStartPickMin = roundUpToStepMin(startPickMin, PICK_LOAD_ROUNDING_STEP_MIN);
  const roundedStartLoadMin = roundUpToStepMin(startLoadMin, PICK_LOAD_ROUNDING_STEP_MIN);

  const byId = new Map(shipments.map((s) => [s.id, s] as const));
  const stableFallbackOrder = shipments.map((s) => s.id);
  const orderIds = (shipmentOrderIds?.length ? shipmentOrderIds : stableFallbackOrder).filter((id) =>
    byId.has(id),
  );
  const sortedShipments = orderIds.map((id) => byId.get(id)!).filter(Boolean);

  const scheduleByShipmentId = new Map<string, PlannerPickLoadScheduleRow>();

  const pickFinishByShipmentId = new Map<string, number>();

  // Picking: batch by Picking MP; each batch shares the same start time.
  let pickCursor = roundedStartPickMin;
  for (let i = 0; i < sortedShipments.length; i += pickingMp) {
    const batch = sortedShipments.slice(i, i + pickingMp);
    let batchPickFinish = pickCursor;
    for (const shipment of batch) {
      const shipmentCases = shipment.orders.reduce((acc, o) => acc + (Number.isFinite(o.cases) ? o.cases : 0), 0);
      const pickDurMinRaw = (shipmentCases / pickingRate) * 60;
      const pickDurMin = applyMinAndRoundUpMin(
        pickDurMinRaw,
        MIN_PICK_LOAD_DURATION_MIN,
        PICK_LOAD_ROUNDING_STEP_MIN,
      );
      const finishPicking = pickCursor + pickDurMin;
      pickFinishByShipmentId.set(shipment.id, finishPicking);
      if (finishPicking > batchPickFinish) batchPickFinish = finishPicking;
    }
    pickCursor = batchPickFinish;
  }

  // Loading: batch by Loading Dock; each batch shares the same PLT.
  let loadCursor = roundedStartLoadMin;
  for (let i = 0; i < sortedShipments.length; i += loadingDock) {
    const batch = sortedShipments.slice(i, i + loadingDock);
    const latestPickFinish = batch.reduce((max, s) => {
      const v = pickFinishByShipmentId.get(s.id) ?? roundedStartPickMin;
      return v > max ? v : max;
    }, Number.NEGATIVE_INFINITY);
    const batchStartLoading = roundUpToStepMin(
      Math.max(loadCursor, latestPickFinish),
      PICK_LOAD_ROUNDING_STEP_MIN,
    );
    let batchLoadFinish = batchStartLoading;
    for (const shipment of batch) {
      const shipmentCases = shipment.orders.reduce((acc, o) => acc + (Number.isFinite(o.cases) ? o.cases : 0), 0);
      const loadDurMinRaw = (shipmentCases / loadingRate) * 60;
      const loadDurMin = applyMinAndRoundUpMin(
        loadDurMinRaw,
        MIN_PICK_LOAD_DURATION_MIN,
        PICK_LOAD_ROUNDING_STEP_MIN,
      );
      const finishLoading = batchStartLoading + loadDurMin;
      if (finishLoading > batchLoadFinish) batchLoadFinish = finishLoading;
      scheduleByShipmentId.set(shipment.id, {
        startPickingMin: null,
        startLoadingMin: batchStartLoading,
        startPickingClock: "—",
        pltClock: formatClockMinutes(batchStartLoading),
      });
    }
    loadCursor = batchLoadFinish;
  }

  // Merge picking times into schedule rows.
  let pickCursorForAssign = roundedStartPickMin;
  for (let i = 0; i < sortedShipments.length; i += pickingMp) {
    const batch = sortedShipments.slice(i, i + pickingMp);
    let batchPickFinish = pickCursorForAssign;
    for (const shipment of batch) {
      const finishPicking = pickFinishByShipmentId.get(shipment.id) ?? pickCursorForAssign;
      if (finishPicking > batchPickFinish) batchPickFinish = finishPicking;
      const existing = scheduleByShipmentId.get(shipment.id);
      scheduleByShipmentId.set(shipment.id, {
        startPickingMin: pickCursorForAssign,
        startLoadingMin: existing?.startLoadingMin ?? null,
        startPickingClock: formatClockMinutes(pickCursorForAssign),
        pltClock: existing?.pltClock ?? "—",
      });
    }
    pickCursorForAssign = batchPickFinish;
  }

  return { scheduleByShipmentId, error: null };
}

function summarizePoExpiredDate(lines: Array<{ poExpiredDate?: string }>): string {
  const uniq = Array.from(new Set(lines.map((line) => formatDateDdMmmYy(line.poExpiredDate)).filter(Boolean)));
  if (uniq.length === 0) return "—";
  return uniq.length === 1 ? uniq[0]! : "MIXED";
}

function summarizePoNumber(lines: Array<{ purchaseOrder: string }>): string {
  const uniq = Array.from(new Set(lines.map((line) => line.purchaseOrder?.trim()).filter(Boolean)));
  if (uniq.length === 0) return "—";
  return uniq.join(", ");
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

const PlannerShipmentsOverviewMap = dynamic(
  () => import("./PlannerShipmentsOverviewMap").then((m) => m.PlannerShipmentsOverviewMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(420px,55vh)] items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#141414] text-xs font-medium text-[#888888]">
        Loading map…
      </div>
    ),
  },
);

/** One row per purchase order per shipment: province order, LTL/LCL last. */
function buildPoSummaryRows(
  shipments: Shipment[],
  scheduleByShipmentId?: Map<string, PlannerPickLoadScheduleRow>,
) {
  const rows: {
    shipmentId: string;
    truckType: string;
    serviceType: Shipment["serviceType"];
    utilizationPct: number;
    dcName: string;
    purchaseOrder: string;
    origin: string;
    province: string;
    dropSequence: number;
    totalQty: number;
    totalKg: number;
    totalCbm: number;
    pld: string;
    rad: string;
    poExpiredDate: string;
    tripDurationMin: number | null;
    startPickingClock: string;
    pltClock: string;
    overlapsSavedPlans?: SavedPlanOverlapRef[];
  }[] = [];

  const shipmentSortMeta = new Map<string, { earliestRadTs: number; originDistanceKm: number }>();

  for (const shipment of shipments) {
    const schedule = scheduleByShipmentId?.get(shipment.id);
    let earliestRadTs = Number.POSITIVE_INFINITY;
    for (const order of shipment.orders) {
      const d = parseDateForOutput(order.rad);
      if (!d) continue;
      const ts = d.getTime();
      if (ts < earliestRadTs) earliestRadTs = ts;
    }
    const firstStop = shipment.dropStops
      .slice()
      .sort((a, b) => a.sequence - b.sequence)[0];
    const originDistanceKm = firstStop?.legFromPreviousKm ?? Number.NEGATIVE_INFINITY;
    shipmentSortMeta.set(shipment.id, { earliestRadTs, originDistanceKm });

    const byPo = new Map<string, typeof shipment.orders>();
    for (const order of shipment.orders) {
      const po = order.purchaseOrder ?? "";
      const list = byPo.get(po) ?? [];
      list.push(order);
      byPo.set(po, list);
    }

    const stopByDc = new Map(shipment.dropStops.map((s) => [s.dcName, s]));
    for (const [purchaseOrder, poOrders] of byPo) {
      const first = poOrders[0];
      if (!first) continue;
      const stop = stopByDc.get(first.dcName);
      rows.push({
        shipmentId: shipment.id,
        truckType: shipment.truckType,
        serviceType: shipment.serviceType,
        utilizationPct: Math.max(shipment.cbmUtilizationPct, shipment.weightUtilizationPct),
        dcName: first.dcName,
        purchaseOrder,
        origin: first.origin?.trim() ?? "",
        province: first.province?.trim() ?? "",
        dropSequence: stop?.sequence ?? 0,
        totalQty: poOrders.reduce((acc, o) => acc + o.cases, 0),
        totalKg: poOrders.reduce((acc, o) => acc + o.totalWeightKg, 0),
        totalCbm: poOrders.reduce((acc, o) => acc + o.totalCbm, 0),
        pld: summarizePld(poOrders),
        rad: summarizeRad(poOrders),
        poExpiredDate: formatDateDdMmmYy(first.poExpiredDate) || "—",
        tripDurationMin: shipment.tripDurationMin ?? null,
        startPickingClock: schedule?.startPickingClock ?? "—",
        pltClock: schedule?.pltClock ?? "—",
        ...(shipment.overlapsSavedPlans && shipment.overlapsSavedPlans.length > 0
          ? { overlapsSavedPlans: shipment.overlapsSavedPlans }
          : {}),
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
        purchaseOrder: a.purchaseOrder,
      },
      {
        serviceType: b.serviceType,
        province: b.province,
        shipmentId: b.shipmentId,
        dropSequence: b.dropSequence,
        dcName: b.dcName,
        purchaseOrder: b.purchaseOrder,
      },
    );
  });

  return rows;
}

/** One row per DC per shipment (all POs rolled up): province order, LTL/LCL last. */
function buildDcSummaryRows(
  shipments: Shipment[],
  scheduleByShipmentId?: Map<string, PlannerPickLoadScheduleRow>,
) {
  const rows: {
    shipmentId: string;
    truckType: string;
    serviceType: Shipment["serviceType"];
    utilizationPct: number;
    dcName: string;
    origin: string;
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
    startPickingClock: string;
    pltClock: string;
    overlapsSavedPlans?: SavedPlanOverlapRef[];
  }[] = [];
  const shipmentSortMeta = new Map<string, { earliestRadTs: number; originDistanceKm: number }>();

  for (const shipment of shipments) {
    const schedule = scheduleByShipmentId?.get(shipment.id);
    let earliestRadTs = Number.POSITIVE_INFINITY;
    for (const order of shipment.orders) {
      const d = parseDateForOutput(order.rad);
      if (!d) continue;
      const ts = d.getTime();
      if (ts < earliestRadTs) earliestRadTs = ts;
    }
    const firstStop = shipment.dropStops
      .slice()
      .sort((a, b) => a.sequence - b.sequence)[0];
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
        startPickingClock: schedule?.startPickingClock ?? "—",
        pltClock: schedule?.pltClock ?? "—",
        ...(shipment.overlapsSavedPlans && shipment.overlapsSavedPlans.length > 0
          ? { overlapsSavedPlans: shipment.overlapsSavedPlans }
          : {}),
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

/** One row per DC+PO per shipment for CT export (so each PO appears on its own row). */
function buildCtExportRows(
  shipments: Shipment[],
  scheduleByShipmentId?: Map<string, PlannerPickLoadScheduleRow>,
) {
  const rows: {
    shipmentId: string;
    truckType: string;
    serviceType: Shipment["serviceType"];
    utilizationPct: number;
    dcName: string;
    origin: string;
    province: string;
    poNumber: string;
    pld: string;
    rad: string;
    poExpiredDate: string;
    totalQty: number;
    totalKg: number;
    totalCbm: number;
    dropSequence: number;
    legFromPreviousKm: number | null;
    legFromPreviousMin: number | null;
    arriveClock: string;
    unloadStartClock: string;
    departClock: string;
    tripDurationMin: number | null;
    startPickingClock: string;
    pltClock: string;
  }[] = [];
  const shipmentSortMeta = new Map<string, { earliestRadTs: number; originDistanceKm: number }>();

  for (const shipment of shipments) {
    let earliestRadTs = Number.POSITIVE_INFINITY;
    for (const order of shipment.orders) {
      const d = parseDateForOutput(order.rad);
      if (!d) continue;
      const ts = d.getTime();
      if (ts < earliestRadTs) earliestRadTs = ts;
    }
    const firstStop = shipment.dropStops
      .slice()
      .sort((a, b) => a.sequence - b.sequence)[0];
    const originDistanceKm = firstStop?.legFromPreviousKm ?? Number.NEGATIVE_INFINITY;
    shipmentSortMeta.set(shipment.id, { earliestRadTs, originDistanceKm });

    const stopByDc = new Map(shipment.dropStops.map((s) => [s.dcName, s]));
    const byDcPo = new Map<string, typeof shipment.orders>();
    for (const order of shipment.orders) {
      const key = `${order.dcName}::${order.purchaseOrder ?? ""}`;
      const list = byDcPo.get(key) ?? [];
      list.push(order);
      byDcPo.set(key, list);
    }

    for (const lines of byDcPo.values()) {
      const first = lines[0];
      if (!first) continue;
      const stop = stopByDc.get(first.dcName);
      const schedule = scheduleByShipmentId?.get(shipment.id);
      rows.push({
        shipmentId: shipment.id,
        truckType: shipment.truckType,
        serviceType: shipment.serviceType,
        utilizationPct: Math.max(shipment.cbmUtilizationPct, shipment.weightUtilizationPct),
        dcName: first.dcName,
        origin: first.origin?.trim() ?? "",
        province: first.province?.trim() ?? "",
        poNumber: first.purchaseOrder?.trim() || "—",
        pld: summarizePld(lines),
        rad: summarizeRad(lines),
        poExpiredDate: summarizePoExpiredDate(lines),
        totalQty: lines.reduce((acc, o) => acc + o.cases, 0),
        totalKg: lines.reduce((acc, o) => acc + o.totalWeightKg, 0),
        totalCbm: lines.reduce((acc, o) => acc + o.totalCbm, 0),
        dropSequence: stop?.sequence ?? 0,
        legFromPreviousKm: stop?.legFromPreviousKm ?? null,
        legFromPreviousMin: stop?.legFromPreviousMin ?? null,
        arriveClock: formatClockMinutes(stop?.arriveMin),
        unloadStartClock: formatClockMinutes(stop?.unloadStartMin),
        departClock: formatClockMinutes(stop?.departMin),
        tripDurationMin: shipment.tripDurationMin ?? null,
        startPickingClock: schedule?.startPickingClock ?? "—",
        pltClock: schedule?.pltClock ?? "—",
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
        purchaseOrder: a.poNumber,
      },
      {
        serviceType: b.serviceType,
        province: b.province,
        shipmentId: b.shipmentId,
        dropSequence: b.dropSequence,
        dcName: b.dcName,
        purchaseOrder: b.poNumber,
      },
    );
  });

  return rows;
}

/** DC-level result (no PO column); edit labels here */
const RESULT_COLS_DC = {
  no: "No.",
  origin: "Origin",
  shipmentId: "Shipment ID",
  dropSequence: "Drop #",
  previousDrop: "Previous drop",
  poNumber: "PO Number",
  startPicking: "Start Picking Time",
  plt: "PLT",
  pld: "PLD",
  rad: "RAD",
  poExpiredDate: "PO Expired Date",
  legKm: "Drive km (leg)",
  legMin: "Drive min (leg)",
  arrive: "Arrive (sim)",
  unloadStart: "Unload start",
  depart: "Depart (unload end)",
  tripDur: "Trip duration",
  dcName: "DC Name",
  totalQty: "Qty",
  totalKg: "KG",
  totalCbm: "CBM",
  utilizationPct: "Utilization %",
  truckType: "Truck Type",
  serviceType: "Service Type",
} as const;

const RESULT_COLS = {
  no: "No",
  origin: "Origin",
  shipmentId: "Shipment ID",
  dcName: "DC Name",
  poNumber: "PO Number",
  startPicking: "Start Picking Time",
  plt: "PLT",
  pld: "PLD",
  rad: "RAD",
  totalQty: "Qty",
  totalKg: "KG",
  totalCbm: "Volume",
  utilizationPct: "Utilization %",
  truckType: "Truck Type",
  serviceType: "Service Type",
  poExpiredDate: "PO Expired Date",
  tripDuration: "Trip duration (min)",
} as const;

const EXPORT_BORDER = {
  top: { style: "thin" as const, color: { rgb: "D1D5DB" } },
  bottom: { style: "thin" as const, color: { rgb: "D1D5DB" } },
  left: { style: "thin" as const, color: { rgb: "D1D5DB" } },
  right: { style: "thin" as const, color: { rgb: "D1D5DB" } },
};

/** One row per order line for the planner workbook "Warehouse" sheet (fixed column order). */
function buildPlannerWarehouseSheetAoA(
  shipments: Shipment[],
  scheduleByShipmentId?: Map<string, PlannerPickLoadScheduleRow>,
): (string | number | Date)[][] {
  const headerRow = [
    "Shipment ID",
    "DC Name",
    "PO Number",
    "Loading Sequence",
    "Address",
    "Truck Type",
    "SKU",
    "Item Description",
    "Qty",
    "Start Picking Time",
    "PLT",
    "PLD",
    "RAD",
    "PO Expired Date",
  ];
  const tuples: { shipment: Shipment; order: Shipment["orders"][number] }[] = [];
  const shipmentSortMeta = new Map<string, { earliestRadTs: number; originDistanceKm: number }>();
  for (const s of shipments) {
    let earliestRadTs = Number.POSITIVE_INFINITY;
    for (const order of s.orders) {
      const d = parseDateForOutput(order.rad);
      if (!d) continue;
      const ts = d.getTime();
      if (ts < earliestRadTs) earliestRadTs = ts;
    }
    const firstStop = s.dropStops
      .slice()
      .sort((a, b) => a.sequence - b.sequence)[0];
    const originDistanceKm = firstStop?.legFromPreviousKm ?? Number.NEGATIVE_INFINITY;
    shipmentSortMeta.set(s.id, { earliestRadTs, originDistanceKm });

    for (const o of s.orders) {
      tuples.push({ shipment: s, order: o });
    }
  }
  tuples.sort((a, b) => {
    const aMeta = shipmentSortMeta.get(a.shipment.id) ?? {
      earliestRadTs: Number.POSITIVE_INFINITY,
      originDistanceKm: Number.NEGATIVE_INFINITY,
    };
    const bMeta = shipmentSortMeta.get(b.shipment.id) ?? {
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
        serviceType: a.shipment.serviceType,
        province: a.order.province?.trim() ?? "",
        shipmentId: a.shipment.id,
        dropSequence: a.order.dropSequence,
        dcName: a.order.dcName,
        purchaseOrder: a.order.purchaseOrder,
        item: a.order.item,
      },
      {
        serviceType: b.shipment.serviceType,
        province: b.order.province?.trim() ?? "",
        shipmentId: b.shipment.id,
        dropSequence: b.order.dropSequence,
        dcName: b.order.dcName,
        purchaseOrder: b.order.purchaseOrder,
        item: b.order.item,
      },
      { dropSequenceOrder: "desc" },
    );
  });
  const maxDropByShipmentId = new Map<string, number>();
  for (const { shipment: s, order: o } of tuples) {
    const prev = maxDropByShipmentId.get(s.id) ?? 0;
    const seq = Number.isFinite(o.dropSequence) ? o.dropSequence : 0;
    if (seq > prev) maxDropByShipmentId.set(s.id, seq);
  }

  const dataRows: (string | number | Date)[][] = tuples.map(({ shipment: s, order: o }) => {
    const schedule = scheduleByShipmentId?.get(s.id);
    const maxDrop = maxDropByShipmentId.get(s.id) ?? 0;
    const dropSeq = Number.isFinite(o.dropSequence) ? o.dropSequence : 0;
    const loadingSequence = maxDrop > 0 && dropSeq > 0 ? maxDrop - dropSeq + 1 : "";
    return [
      s.id,
      o.dcName,
      o.purchaseOrder,
      loadingSequence,
      o.address ?? "",
      s.truckType,
      o.item,
      o.itemDescription ?? "",
      o.cases,
      schedule?.startPickingClock ?? "—",
      schedule?.pltClock ?? "—",
      toExcelDateCell(o.pld, ""),
      toExcelDateCell(o.rad, ""),
      toExcelDateCell(o.orderDate, ""),
    ];
  });
  return [headerRow, ...dataRows];
}

function applyPlannerExportGridStyles(
  worksheet: XLSX.WorkSheet,
  range: { s: { r: number; c: number }; e: { r: number; c: number } },
) {
  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      if (!worksheet[cellAddress]) continue;

      if (row === 0) {
        worksheet[cellAddress].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { patternType: "solid", fgColor: { rgb: "1F4E78" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: EXPORT_BORDER,
        };
      } else {
        worksheet[cellAddress].s = {
          border: EXPORT_BORDER,
        };
      }
    }
  }
}

function computePlannerExportColumnWidths(
  worksheet: XLSX.WorkSheet,
  range: { s: { r: number; c: number }; e: { r: number; c: number } },
) {
  return Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => {
    const col = range.s.c + index;
    let maxLen = 10;
    for (let row = range.s.r; row <= range.e.r; row++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[cellAddress];
      if (!cell || cell.v === undefined || cell.v === null) continue;
      const valueLength = String(cell.v).length;
      if (valueLength > maxLen) maxLen = valueLength;
    }
    return { wch: Math.min(maxLen + 2, 60) };
  });
}

/** Column order matches the on-screen "By DC" results table (excludes unused `previousDrop`). */
const CT_DC_EXPORT_HEADERS: readonly string[] = [
  RESULT_COLS_DC.no,
  RESULT_COLS_DC.origin,
  RESULT_COLS_DC.shipmentId,
  RESULT_COLS_DC.dropSequence,
  RESULT_COLS_DC.dcName,
  RESULT_COLS_DC.poNumber,
  RESULT_COLS_DC.startPicking,
  RESULT_COLS_DC.plt,
  RESULT_COLS_DC.legKm,
  RESULT_COLS_DC.legMin,
  RESULT_COLS_DC.arrive,
  RESULT_COLS_DC.unloadStart,
  RESULT_COLS_DC.depart,
  RESULT_COLS_DC.tripDur,
  RESULT_COLS_DC.totalQty,
  RESULT_COLS_DC.totalKg,
  RESULT_COLS_DC.totalCbm,
  RESULT_COLS_DC.utilizationPct,
  RESULT_COLS_DC.truckType,
  RESULT_COLS_DC.serviceType,
  RESULT_COLS_DC.pld,
  RESULT_COLS_DC.rad,
  RESULT_COLS_DC.poExpiredDate,
];

function applyCtSheetDcPresentationStyles(
  worksheet: XLSX.WorkSheet,
  range: { s: { r: number; c: number }; e: { r: number; c: number } },
) {
  const ctDcColumnStyles: Record<
    string,
    { width: number; align: "left" | "center" | "right"; numFmt?: string }
  > = {
    [RESULT_COLS_DC.no]: { width: 7, align: "center", numFmt: "0" },
    [RESULT_COLS_DC.origin]: { width: 22, align: "left" },
    [RESULT_COLS_DC.shipmentId]: { width: 14, align: "left" },
    [RESULT_COLS_DC.dropSequence]: { width: 8, align: "right" },
    [RESULT_COLS_DC.dcName]: { width: 28, align: "left" },
    [RESULT_COLS_DC.poNumber]: { width: 16, align: "left" },
    [RESULT_COLS_DC.startPicking]: { width: 16, align: "right" },
    [RESULT_COLS_DC.plt]: { width: 10, align: "right" },
    [RESULT_COLS_DC.pld]: { width: 12, align: "center", numFmt: EXPORT_DATE_NUM_FMT },
    [RESULT_COLS_DC.rad]: { width: 12, align: "center", numFmt: EXPORT_DATE_NUM_FMT },
    [RESULT_COLS_DC.poExpiredDate]: { width: 16, align: "center", numFmt: EXPORT_DATE_NUM_FMT },
    [RESULT_COLS_DC.legKm]: { width: 12, align: "right", numFmt: "#,##0.0" },
    [RESULT_COLS_DC.legMin]: { width: 10, align: "right", numFmt: "#,##0" },
    [RESULT_COLS_DC.arrive]: { width: 12, align: "right" },
    [RESULT_COLS_DC.unloadStart]: { width: 12, align: "right" },
    [RESULT_COLS_DC.depart]: { width: 14, align: "right" },
    [RESULT_COLS_DC.tripDur]: { width: 14, align: "right" },
    [RESULT_COLS_DC.totalQty]: { width: 10, align: "right", numFmt: "#,##0" },
    [RESULT_COLS_DC.totalKg]: { width: 12, align: "right", numFmt: "#,##0.00" },
    [RESULT_COLS_DC.totalCbm]: { width: 12, align: "right", numFmt: "#,##0.000" },
    [RESULT_COLS_DC.utilizationPct]: { width: 12, align: "right" },
    [RESULT_COLS_DC.truckType]: { width: 12, align: "left" },
    [RESULT_COLS_DC.serviceType]: { width: 12, align: "center" },
  };

  const columnMeta = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => {
    const col = range.s.c + index;
    const headerAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    const header = String(worksheet[headerAddress]?.v ?? "");
    return ctDcColumnStyles[header] ?? { width: 14, align: "left" as const };
  });
  const headerByColumn = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => {
    const col = range.s.c + index;
    const headerAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    return String(worksheet[headerAddress]?.v ?? "");
  });

  const shipmentIdColumn = headerByColumn.findIndex((h) => h === RESULT_COLS_DC.shipmentId);
  const serviceTypeColumn = headerByColumn.findIndex((h) => h === RESULT_COLS_DC.serviceType);

  let previousShipmentId = "";

  for (let row = range.s.r; row <= range.e.r; row++) {
    const shipmentIdCellAddress =
      shipmentIdColumn >= 0
        ? XLSX.utils.encode_cell({ r: row, c: range.s.c + shipmentIdColumn })
        : null;
    const shipmentIdValue =
      shipmentIdCellAddress != null ? String(worksheet[shipmentIdCellAddress]?.v ?? "") : "";
    const startsNewShipment = row > range.s.r && shipmentIdValue !== "" && shipmentIdValue !== previousShipmentId;

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[cellAddress];
      if (!cell) continue;
      const meta = columnMeta[col - range.s.c];

      if (row === 0) {
        cell.s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { patternType: "solid", fgColor: { rgb: "102A43" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: {
            top: { style: "medium", color: { rgb: "0B1F33" } },
            bottom: { style: "medium", color: { rgb: "0B1F33" } },
            left: { style: "thin", color: { rgb: "0B1F33" } },
            right: { style: "thin", color: { rgb: "0B1F33" } },
          },
        };
        continue;
      }

      let zebraFill = row % 2 === 0 ? "F8FAFC" : "F1F5F9";
      const isServiceTypeCell = serviceTypeColumn >= 0 && col === range.s.c + serviceTypeColumn;
      if (isServiceTypeCell) {
        const rawServiceType = String(cell.v ?? "").toUpperCase();
        if (rawServiceType === "FTL" || rawServiceType === "FCL") zebraFill = "E6FFFA";
        if (rawServiceType === "LTL" || rawServiceType === "LCL") zebraFill = "FFF7ED";
      }

      cell.s = {
        border: {
          top: {
            style: startsNewShipment ? "medium" : "thin",
            color: { rgb: startsNewShipment ? "94A3B8" : "CBD5E1" },
          },
          bottom: { style: "thin", color: { rgb: "CBD5E1" } },
          left: { style: "thin", color: { rgb: "CBD5E1" } },
          right: { style: "thin", color: { rgb: "CBD5E1" } },
        },
        fill: { patternType: "solid", fgColor: { rgb: zebraFill } },
        alignment: { horizontal: meta.align, vertical: "center", wrapText: false },
        font: {
          color: { rgb: "0F172A" },
          bold: isServiceTypeCell && String(cell.v ?? "").trim().length > 0,
        },
        ...(meta.numFmt ? { numFmt: meta.numFmt } : {}),
      };
    }

    if (row > range.s.r && shipmentIdValue !== "") {
      previousShipmentId = shipmentIdValue;
    }
  }

  worksheet["!cols"] = columnMeta.map((m) => ({ wch: m.width }));
  worksheet["!rows"] = [{ hpt: 28 }, ...Array.from({ length: range.e.r - range.s.r }, () => ({ hpt: 21 }))];
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
  (worksheet as XLSX.WorkSheet & { ["!freeze"]?: unknown })["!freeze"] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: "A2",
    activePane: "bottomLeft",
    state: "frozen",
  };
}

function applyWarehouseSheetPresentationStyles(
  worksheet: XLSX.WorkSheet,
  range: { s: { r: number; c: number }; e: { r: number; c: number } },
) {
  const warehouseColumnStyles: Record<
    string,
    { width: number; align: "left" | "center" | "right"; numFmt?: string }
  > = {
    "Shipment ID": { width: 14, align: "left" },
    "Start Picking Time": { width: 16, align: "right" },
    PLT: { width: 10, align: "right" },
    "PO Number": { width: 16, align: "left" },
    "DC Name": { width: 28, align: "left" },
    "Loading Sequence": { width: 16, align: "right", numFmt: "0" },
    Address: { width: 36, align: "left" },
    "Truck Type": { width: 12, align: "left" },
    SKU: { width: 18, align: "left" },
    "Item Description": { width: 36, align: "left" },
    Qty: { width: 10, align: "right", numFmt: "#,##0" },
    PLD: { width: 12, align: "center", numFmt: EXPORT_DATE_NUM_FMT },
    RAD: { width: 12, align: "center", numFmt: EXPORT_DATE_NUM_FMT },
    "PO Expired Date": { width: 16, align: "center", numFmt: EXPORT_DATE_NUM_FMT },
  };

  const headerByColumn = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => {
    const col = range.s.c + index;
    const headerAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    return String(worksheet[headerAddress]?.v ?? "");
  });
  const columnMeta = headerByColumn.map(
    (header) => warehouseColumnStyles[header] ?? { width: 14, align: "left" as const },
  );

  const shipmentIdColumn = headerByColumn.findIndex((h) => h === "Shipment ID");
  let previousShipmentId = "";

  for (let row = range.s.r; row <= range.e.r; row++) {
    const shipmentIdCellAddress =
      shipmentIdColumn >= 0
        ? XLSX.utils.encode_cell({ r: row, c: range.s.c + shipmentIdColumn })
        : null;
    const shipmentIdValue =
      shipmentIdCellAddress != null ? String(worksheet[shipmentIdCellAddress]?.v ?? "") : "";
    const startsNewShipment = row > range.s.r && shipmentIdValue !== "" && shipmentIdValue !== previousShipmentId;

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[cellAddress];
      if (!cell) continue;
      const meta = columnMeta[col - range.s.c];

      if (row === 0) {
        cell.s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { patternType: "solid", fgColor: { rgb: "102A43" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: {
            top: { style: "medium", color: { rgb: "0B1F33" } },
            bottom: { style: "medium", color: { rgb: "0B1F33" } },
            left: { style: "thin", color: { rgb: "0B1F33" } },
            right: { style: "thin", color: { rgb: "0B1F33" } },
          },
        };
        continue;
      }

      const zebraFill = row % 2 === 0 ? "F8FAFC" : "F1F5F9";
      cell.s = {
        border: {
          top: {
            style: startsNewShipment ? "medium" : "thin",
            color: { rgb: startsNewShipment ? "94A3B8" : "CBD5E1" },
          },
          bottom: { style: "thin", color: { rgb: "CBD5E1" } },
          left: { style: "thin", color: { rgb: "CBD5E1" } },
          right: { style: "thin", color: { rgb: "CBD5E1" } },
        },
        fill: { patternType: "solid", fgColor: { rgb: zebraFill } },
        alignment: { horizontal: meta.align, vertical: "center", wrapText: false },
        font: { color: { rgb: "0F172A" } },
        ...(meta.numFmt ? { numFmt: meta.numFmt } : {}),
      };
    }

    if (row > range.s.r && shipmentIdValue !== "") {
      previousShipmentId = shipmentIdValue;
    }
  }

  worksheet["!cols"] = columnMeta.map((m) => ({ wch: m.width }));
  worksheet["!rows"] = [{ hpt: 28 }, ...Array.from({ length: range.e.r - range.s.r }, () => ({ hpt: 21 }))];
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
  (worksheet as XLSX.WorkSheet & { ["!freeze"]?: unknown })["!freeze"] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: "A2",
    activePane: "bottomLeft",
    state: "frozen",
  };
}

function formatUtilization(serviceType: Shipment["serviceType"], utilizationPct: number): string {
  if (serviceType === "LTL" || serviceType === "LCL") return "-";
  return `${utilizationPct.toFixed(1)}%`;
}

const tabBadgeStyle = (active: boolean): CSSProperties =>
  active
    ? {
        background: "rgba(29,158,117,0.12)",
        color: "#1D9E75",
        fontSize: 11,
        padding: "1px 7px",
        borderRadius: 99,
      }
    : {
        background: "#2a2a2a",
        color: "#888",
        fontSize: 11,
        padding: "1px 7px",
        borderRadius: 99,
      };

function DragHandleDotsSvg({ className }: { className?: string }) {
  return (
    <svg width="8" height="12" viewBox="0 0 8 12" fill="none" className={className} aria-hidden>
      <circle cx="2" cy="2" r="1" fill="#444" />
      <circle cx="6" cy="2" r="1" fill="#444" />
      <circle cx="2" cy="5.5" r="1" fill="#444" />
      <circle cx="6" cy="5.5" r="1" fill="#444" />
      <circle cx="2" cy="9" r="1" fill="#444" />
      <circle cx="6" cy="9" r="1" fill="#444" />
    </svg>
  );
}

function DropSequenceBadge({ dropSequence }: { dropSequence: number }) {
  if (!Number.isFinite(dropSequence) || dropSequence <= 0) {
    return <span className="text-[11px] text-[#666]">—</span>;
  }
  const palette =
    dropSequence === 1
      ? { background: "#1e2e1e", color: "#1D9E75" }
      : dropSequence === 2
        ? { background: "#1e1e2e", color: "#7a9aff" }
        : dropSequence === 3
          ? { background: "#2e2a1e", color: "#ffcc7a" }
          : { background: "#2e1e1e", color: "#ff9a7a" };
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium"
      style={palette}
    >
      Drop {dropSequence}
    </span>
  );
}

function OverlapWithSavedPlanChip({ overlaps }: { overlaps?: SavedPlanOverlapRef[] }) {
  if (!overlaps || overlaps.length === 0) return null;
  const single = overlaps.length === 1;
  const target = single ? `/planner/saved/${overlaps[0]!.planId}` : "/planner/saved";
  const names = overlaps.map((o) => o.planName).join(", ");
  const tooltip = single
    ? `Overlaps saved plan: ${overlaps[0]!.planName} \u2014 click to open in a new tab`
    : `Overlaps ${overlaps.length} saved plans: ${names} \u2014 click to open the saved plans list in a new tab`;
  const stopRowDrag = (event: React.MouseEvent | React.PointerEvent) => {
    event.stopPropagation();
  };
  return (
    <Link
      href={target}
      target="_blank"
      rel="noreferrer"
      title={tooltip}
      onClick={stopRowDrag}
      onMouseDown={stopRowDrag}
      onPointerDown={stopRowDrag}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      draggable={false}
      className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-[#2c3a55] bg-[#16223a] px-2 py-[1px] text-[10px] font-medium text-[#9bb3ff] transition-colors hover:bg-[#1c2c4a] hover:text-[#b6c5ff]"
    >
      {single ? (
        <>
          <span className="shrink-0">Overlaps saved plan:</span>
          <span className="truncate">{overlaps[0]!.planName}</span>
        </>
      ) : (
        <span className="truncate">Overlaps {overlaps.length} saved plans</span>
      )}
    </Link>
  );
}

type RenderCol<Row> = {
  id: PlannerColumnConfig["id"];
  thClassName: string;
  tdClassName: string;
  getValue: (row: Row, index: number) => React.ReactNode;
};

export function PlannerResults() {
  const { consolidationResult, data, moveDcToShipment, consolidationPlanning, loadedFromSavedPlan, clearPlannerState } =
    usePlannerContext();
  const { getTabColumns } = usePlannerResultsColumns();
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [draggingRowKey, setDraggingRowKey] = useState<string | null>(null);
  const [dragPayload, setDragPayload] = useState<{ sourceShipmentId: string; dcName: string } | null>(
    null,
  );
  const [dragOverShipmentId, setDragOverShipmentId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveSuccess, setMoveSuccess] = useState<string | null>(null);
  const [warehouseTimeMotion, setWarehouseTimeMotion] = useState<WarehouseTimeMotionSettingsClient | null>(
    null,
  );
  const [warehouseTimeMotionError, setWarehouseTimeMotionError] = useState<string | null>(null);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<{ id: string; name: string } | null>(null);
  const [resultsTab, setResultsTab] = useState<PlannerResultsTab>("dc");
  const [grabbingRowKey, setGrabbingRowKey] = useState<string | null>(null);
  const mapDialogRef = useRef<HTMLDivElement | null>(null);
  const mapDialogCloseRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedBeforeMapRef = useRef<HTMLElement | null>(null);

  const loadWarehouseTimeMotion = async (): Promise<WarehouseTimeMotionSettingsClient | null> => {
    try {
      const res = await fetch("/api/planner/warehouse-time-motion", { method: "GET" });
      if (!res.ok) throw new Error("Failed to load Warehouse Time Motion settings.");
      const payload = (await res.json()) as
        | { success: true; data: WarehouseTimeMotionSettingsClient }
        | { success: false; error?: string };
      if (!payload.success) throw new Error(payload.error || "Failed to load Warehouse Time Motion settings.");
      setWarehouseTimeMotion(payload.data);
      setWarehouseTimeMotionError(null);
      return payload.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load Warehouse Time Motion settings.";
      setWarehouseTimeMotionError(msg);
      return null;
    }
  };

  useEffect(() => {
    setIsClientMounted(true);
    return () => setIsClientMounted(false);
  }, []);

  useEffect(() => {
    if (!consolidationResult) return;
    if (warehouseTimeMotion) return;
    void loadWarehouseTimeMotion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consolidationResult]);

  useEffect(() => {
    if (!isMapFullscreen) return;
    lastFocusedBeforeMapRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMapFullscreen(false);
    };
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => {
        lastFocusedBeforeMapRef.current?.focus();
      }, 0);
    };
  }, [isMapFullscreen]);

  useEffect(() => {
    if (grabbingRowKey == null) return;
    const clear = () => setGrabbingRowKey(null);
    window.addEventListener("mouseup", clear);
    return () => window.removeEventListener("mouseup", clear);
  }, [grabbingRowKey]);

  useEffect(() => {
    if (!isMapFullscreen) return;
    mapDialogCloseRef.current?.focus();
    const dialog = mapDialogRef.current;
    if (!dialog) return;
    const onDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onDialogKeyDown);
    return () => dialog.removeEventListener("keydown", onDialogKeyDown);
  }, [isMapFullscreen]);

  const dcCoordMap = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const row of data.rawAddressMaster) {
      const dc = (row.dcName ?? row.DC ?? "").trim();
      if (!dc) continue;
      const lat = Number(row.latitude ?? row.Latitude);
      const lng = Number(row.longitude ?? row.Longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        m.set(dc, { lat, lng });
      }
    }
    return m;
  }, [data.rawAddressMaster]);

  const dcSummaryRowsBase = useMemo(
    () => (consolidationResult ? buildDcSummaryRows(consolidationResult.shipments) : []),
    [consolidationResult],
  );

  const shipmentOrderIds = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const row of dcSummaryRowsBase) {
      if (seen.has(row.shipmentId)) continue;
      seen.add(row.shipmentId);
      out.push(row.shipmentId);
    }
    return out;
  }, [dcSummaryRowsBase]);

  const pickLoadSchedule = useMemo(() => {
    if (!consolidationResult || !warehouseTimeMotion) {
      return {
        scheduleByShipmentId: new Map<string, PlannerPickLoadScheduleRow>(),
        error: null as string | null,
      };
    }
    return computePlannerPickLoadSchedule(consolidationResult.shipments, warehouseTimeMotion, shipmentOrderIds);
  }, [consolidationResult, shipmentOrderIds, warehouseTimeMotion]);

  const poSummaryRows = useMemo(
    () =>
      consolidationResult
        ? buildPoSummaryRows(consolidationResult.shipments, pickLoadSchedule.scheduleByShipmentId)
        : [],
    [consolidationResult, pickLoadSchedule.scheduleByShipmentId],
  );

  const dcSummaryRows = useMemo(
    () =>
      consolidationResult
        ? buildDcSummaryRows(consolidationResult.shipments, pickLoadSchedule.scheduleByShipmentId)
        : [],
    [consolidationResult, pickLoadSchedule.scheduleByShipmentId],
  );

  const DC_COLS = useMemo<RenderCol<(typeof dcSummaryRows)[number]>[]>(() => {
    const thBase = "px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.04em] text-[#555]";
    const tdBase = "px-3 py-2 align-top";
    return [
      {
        id: "no",
        thClassName: cn("w-9", thBase),
        tdClassName: cn("w-9 text-[#666]", tdBase),
        getValue: (_row, index) => index + 1,
      },
      {
        id: "shipmentId",
        thClassName: thBase,
        tdClassName: cn("min-w-0", tdBase),
        getValue: (row) => (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="truncate" title={`${row.shipmentId} · ${row.origin?.trim() || "—"}`}>
              <span className="font-medium text-white">{row.shipmentId}</span>
              <span className="text-[11px] text-[#888]"> · {row.origin?.trim() || "—"}</span>
            </div>
            {row.overlapsSavedPlans && row.overlapsSavedPlans.length > 0 && (
              <OverlapWithSavedPlanChip overlaps={row.overlapsSavedPlans} />
            )}
          </div>
        ),
      },
      {
        id: "dcName",
        thClassName: thBase,
        tdClassName: cn("min-w-0 text-[#ccc]", tdBase),
        getValue: (row) => <div>{row.dcName}</div>,
      },
      {
        id: "dropSequence",
        thClassName: cn("w-20", thBase),
        tdClassName: cn("w-20", tdBase),
        getValue: (row) => <DropSequenceBadge dropSequence={row.dropSequence} />,
      },
      {
        id: "startPicking",
        thClassName: cn("w-20", thBase),
        tdClassName: cn("w-20 text-[#aaa]", tdBase),
        getValue: (row) => row.startPickingClock,
      },
      {
        id: "plt",
        thClassName: cn("w-20", thBase),
        tdClassName: cn("w-20 text-[#aaa]", tdBase),
        getValue: (row) => row.pltClock,
      },
      {
        id: "legKm",
        thClassName: cn("hidden md:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden md:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => (row.legFromPreviousKm != null ? row.legFromPreviousKm.toFixed(1) : "—"),
      },
      {
        id: "legMin",
        thClassName: cn("hidden md:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden md:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => (row.legFromPreviousMin != null ? Math.round(row.legFromPreviousMin) : "—"),
      },
      {
        id: "arrive",
        thClassName: cn("hidden lg:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden lg:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => row.arriveClock,
      },
      {
        id: "unloadStart",
        thClassName: cn("hidden lg:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden lg:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => row.unloadStartClock,
      },
      {
        id: "depart",
        thClassName: cn("hidden lg:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden lg:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => row.departClock,
      },
      {
        id: "tripDur",
        thClassName: cn("hidden xl:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden xl:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => formatTripDurationMin(row.tripDurationMin),
      },
      {
        id: "totalQty",
        thClassName: cn("hidden md:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden md:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => row.totalQty,
      },
      {
        id: "totalKg",
        thClassName: cn("hidden md:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden md:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => row.totalKg.toFixed(2),
      },
      {
        id: "totalCbm",
        thClassName: cn("hidden md:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden md:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => row.totalCbm.toFixed(2),
      },
      {
        id: "utilizationPct",
        thClassName: cn("hidden xl:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden xl:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => formatUtilization(row.serviceType, row.utilizationPct),
      },
      {
        id: "truckType",
        thClassName: cn("hidden lg:table-cell", thBase),
        tdClassName: cn("hidden lg:table-cell", tdBase, "text-[#ccc]"),
        getValue: (row) => row.truckType,
      },
      {
        id: "serviceType",
        thClassName: cn("hidden lg:table-cell", thBase),
        tdClassName: cn("hidden lg:table-cell", tdBase, "text-[#ccc]"),
        getValue: (row) => row.serviceType,
      },
      {
        id: "pld",
        thClassName: cn("hidden xl:table-cell", thBase, "text-center"),
        tdClassName: cn("hidden xl:table-cell", tdBase, "text-center text-[#aaa]"),
        getValue: (row) => row.pld,
      },
      {
        id: "rad",
        thClassName: cn("hidden xl:table-cell", thBase, "text-center"),
        tdClassName: cn("hidden xl:table-cell", tdBase, "text-center text-[#aaa]"),
        getValue: (row) => row.rad,
      },
    ];
  }, [dcSummaryRows]);

  const PO_COLS = useMemo<RenderCol<(typeof poSummaryRows)[number]>[]>(() => {
    const thBase = "px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.04em] text-[#555]";
    const tdBase = "px-3 py-2 align-top";
    return [
      {
        id: "no",
        thClassName: cn("w-9", thBase),
        tdClassName: cn("w-9 text-[#666]", tdBase),
        getValue: (_row, index) => index + 1,
      },
      {
        id: "shipmentId",
        thClassName: thBase,
        tdClassName: cn("min-w-0", tdBase),
        getValue: (row) => (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="truncate" title={`${row.shipmentId} · ${row.origin?.trim() || "—"}`}>
              <span className="font-medium text-white">{row.shipmentId}</span>
              <span className="text-[11px] text-[#888]"> · {row.origin?.trim() || "—"}</span>
            </div>
            {row.overlapsSavedPlans && row.overlapsSavedPlans.length > 0 && (
              <OverlapWithSavedPlanChip overlaps={row.overlapsSavedPlans} />
            )}
          </div>
        ),
      },
      {
        id: "dcName",
        thClassName: thBase,
        tdClassName: cn("min-w-0 text-[#ccc]", tdBase),
        getValue: (row) => <div>{row.dcName}</div>,
      },
      {
        id: "poNumber",
        thClassName: thBase,
        tdClassName: cn("min-w-0 text-[#ccc]", tdBase),
        getValue: (row) => row.purchaseOrder,
      },
      {
        id: "dropSequence",
        thClassName: cn("w-20", thBase),
        tdClassName: cn("w-20", tdBase),
        getValue: (row) => <DropSequenceBadge dropSequence={row.dropSequence} />,
      },
      {
        id: "startPicking",
        thClassName: cn("w-20", thBase),
        tdClassName: cn("w-20 text-[#aaa]", tdBase),
        getValue: (row) => row.startPickingClock,
      },
      {
        id: "plt",
        thClassName: cn("w-20", thBase),
        tdClassName: cn("w-20 text-[#aaa]", tdBase),
        getValue: (row) => row.pltClock,
      },
      {
        id: "totalQty",
        thClassName: cn("hidden md:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden md:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => row.totalQty,
      },
      {
        id: "totalKg",
        thClassName: cn("hidden md:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden md:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => row.totalKg.toFixed(2),
      },
      {
        id: "totalCbm",
        thClassName: cn("hidden md:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden md:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => row.totalCbm.toFixed(2),
      },
      {
        id: "utilizationPct",
        thClassName: cn("hidden lg:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden lg:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => formatUtilization(row.serviceType, row.utilizationPct),
      },
      {
        id: "truckType",
        thClassName: cn("hidden lg:table-cell", thBase),
        tdClassName: cn("hidden lg:table-cell", tdBase, "text-[#ccc]"),
        getValue: (row) => row.truckType,
      },
      {
        id: "serviceType",
        thClassName: cn("hidden lg:table-cell", thBase),
        tdClassName: cn("hidden lg:table-cell", tdBase, "text-[#ccc]"),
        getValue: (row) => row.serviceType,
      },
      {
        id: "tripDur",
        thClassName: cn("hidden xl:table-cell", thBase, "text-right"),
        tdClassName: cn("hidden xl:table-cell", tdBase, "text-right tabular-nums text-[#aaa]"),
        getValue: (row) => formatTripDurationMin(row.tripDurationMin),
      },
      {
        id: "pld",
        thClassName: cn("hidden xl:table-cell", thBase, "text-center"),
        tdClassName: cn("hidden xl:table-cell", tdBase, "text-center text-[#aaa]"),
        getValue: (row) => row.pld,
      },
      {
        id: "rad",
        thClassName: cn("hidden xl:table-cell", thBase, "text-center"),
        tdClassName: cn("hidden xl:table-cell", tdBase, "text-center text-[#aaa]"),
        getValue: (row) => row.rad,
      },
      {
        id: "poExpiredDate",
        thClassName: cn("hidden xl:table-cell", thBase, "text-center"),
        tdClassName: cn("hidden xl:table-cell", tdBase, "text-center text-[#aaa]"),
        getValue: (row) => row.poExpiredDate,
      },
    ];
  }, [poSummaryRows]);

  const UNASSIGNED_COLS = useMemo<RenderCol<Shipment["orders"][number] & { _reason?: string; _overlaps?: SavedPlanOverlapRef[] }>[]>(() => {
    const thBase = "px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.04em] text-[#555]";
    const tdBase = "px-3 py-2 align-top";
    return [
      {
        id: "no",
        thClassName: cn("w-9", thBase),
        tdClassName: cn("w-9 text-[#666]", tdBase),
        getValue: (_row, index) => index + 1,
      },
      {
        id: "shipmentId",
        thClassName: thBase,
        tdClassName: cn("min-w-0", tdBase),
        getValue: (o) => {
          const po = o.purchaseOrder?.trim() || "—";
          const origin = o.origin?.trim() || "—";
          return (
            <div className="flex min-w-0 flex-col gap-1">
              <div className="truncate" title={`${po} · ${origin}${o._reason ? ` · ${o._reason}` : ""}`}>
                <span className="font-medium text-white">{po}</span>
                <span className="text-[11px] text-[#888]"> · {origin}</span>
                {o._reason && <span className="text-[11px] text-[#ff9a7a]"> · {o._reason}</span>}
              </div>
              {o._overlaps && o._overlaps.length > 0 && <OverlapWithSavedPlanChip overlaps={o._overlaps} />}
            </div>
          );
        },
      },
      {
        id: "dcName",
        thClassName: thBase,
        tdClassName: cn("min-w-0 text-[#ccc]", tdBase),
        getValue: (o) => o.dcName?.trim() || "—",
      },
      {
        id: "dropSequence",
        thClassName: cn("w-20", thBase),
        tdClassName: cn("w-20", tdBase),
        getValue: () => <DropSequenceBadge dropSequence={0} />,
      },
      {
        id: "startPicking",
        thClassName: cn("w-20", thBase),
        tdClassName: cn("w-20 text-[#aaa]", tdBase),
        getValue: () => "—",
      },
      {
        id: "plt",
        thClassName: cn("w-20", thBase),
        tdClassName: cn("w-20 text-[#aaa]", tdBase),
        getValue: () => "—",
      },
    ];
  }, []);

  const visibleColumns = useMemo(() => {
    const definitionsByTab: Record<PlannerResultsTab, RenderCol<any>[]> = {
      dc: DC_COLS,
      po: PO_COLS,
      unassigned: UNASSIGNED_COLS,
    };
    const defs = definitionsByTab[resultsTab];
    const defById = new Map(defs.map((c) => [c.id, c] as const));

    const config = getTabColumns(resultsTab);
    const fromConfig = config
      .filter((c) => c.enabled)
      .map((c) => {
        const def = defById.get(c.id);
        return def ? { ...def, headerLabel: c.label } : null;
      })
      .filter(Boolean) as Array<RenderCol<any> & { headerLabel: string }>;

    if (fromConfig.length > 0) return fromConfig;

    const fallbackDefaults = defaultColumnsByTab()[resultsTab];
    return fallbackDefaults
      .filter((c) => c.enabled)
      .map((c) => {
        const def = defById.get(c.id);
        return def ? { ...def, headerLabel: c.label } : null;
      })
      .filter(Boolean) as Array<RenderCol<any> & { headerLabel: string }>;
  }, [DC_COLS, PO_COLS, UNASSIGNED_COLS, getTabColumns, resultsTab]);

  const exportResultsToXlsx = async () => {
    if (!consolidationResult) return;
    const emDash = "—";
    const settings = warehouseTimeMotion ?? (await loadWarehouseTimeMotion());
    const scheduleByShipmentId =
      settings != null
        ? computePlannerPickLoadSchedule(consolidationResult.shipments, settings, shipmentOrderIds).scheduleByShipmentId
        : new Map<string, PlannerPickLoadScheduleRow>();

    const ctExportRows = buildCtExportRows(consolidationResult.shipments, scheduleByShipmentId);
    const dcAoA: (string | number | Date)[][] = [
      [...CT_DC_EXPORT_HEADERS],
      ...ctExportRows.map((row, index) => [
        index + 1,
        row.origin?.trim() ? row.origin : emDash,
        row.shipmentId,
        row.dropSequence > 0 ? row.dropSequence : emDash,
        row.dcName,
        row.poNumber,
        row.startPickingClock,
        row.pltClock,
        row.legFromPreviousKm != null ? Number(row.legFromPreviousKm.toFixed(1)) : emDash,
        row.legFromPreviousMin != null ? Math.round(row.legFromPreviousMin) : emDash,
        row.arriveClock,
        row.unloadStartClock,
        row.departClock,
        formatTripDurationMin(row.tripDurationMin),
        row.totalQty,
        Number(row.totalKg.toFixed(2)),
        Number(row.totalCbm.toFixed(2)),
        formatUtilization(row.serviceType, row.utilizationPct),
        row.truckType,
        row.serviceType,
        toExcelDateCell(row.pld, emDash),
        toExcelDateCell(row.rad, emDash),
        toExcelDateCell(row.poExpiredDate, emDash),
      ]),
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(dcAoA, { cellDates: true });
    const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
    applyCtSheetDcPresentationStyles(worksheet, range);

    XLSX.utils.book_append_sheet(workbook, worksheet, "CT");

    const warehouseAoA = buildPlannerWarehouseSheetAoA(consolidationResult.shipments, scheduleByShipmentId);
    const warehouseWs = XLSX.utils.aoa_to_sheet(warehouseAoA, { cellDates: true });
    const whRange = XLSX.utils.decode_range(warehouseWs["!ref"] ?? "A1");
    applyWarehouseSheetPresentationStyles(warehouseWs, whRange);
    XLSX.utils.book_append_sheet(workbook, warehouseWs, "Warehouse");

    const dateStamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `planner-results-${dateStamp}.xlsx`);
  };

  const handleMoveDc = async (sourceShipmentId: string, dcName: string, targetShipmentId: string) => {
    if (sourceShipmentId === targetShipmentId) {
      setMoveError("Choose another shipment.");
      setMoveSuccess(null);
      return;
    }
    const result = await moveDcToShipment(sourceShipmentId, dcName, targetShipmentId);
    if (!result.ok) {
      setMoveError(result.error);
      setMoveSuccess(null);
      return;
    }
    setMoveError(null);
    setMoveSuccess("Updated.");
  };

  if (!consolidationResult) {
    return null;
  }

  return (
    <section className="om-panel space-y-5 rounded-lg p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-black tracking-tight text-[#e0e0e0]">Results</h2>
          <p className="mt-0.5 text-xs text-[#888888]">
            {consolidationResult.shipments.length} shipment
            {consolidationResult.shipments.length === 1 ? "" : "s"}
            {consolidationResult.unassignedOrders.length > 0
              ? ` · ${consolidationResult.unassignedOrders.length} unassigned`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {consolidationResult.shipments.length > 0 && (
            <Button
              type="button"
              onClick={() => {
                setSaveSuccess(null);
                setIsSaveDialogOpen(true);
              }}
              disabled={consolidationPlanning}
              className="touch-manipulation"
            >
              Save plan
            </Button>
          )}
          <Button type="button" onClick={exportResultsToXlsx} className="touch-manipulation gap-2">
            <Download className="size-4 shrink-0" aria-hidden />
            Export XLSX
          </Button>
        </div>
      </div>

      {loadedFromSavedPlan && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-emerald-100">
              Loaded from saved plan: <span className="font-mono">{loadedFromSavedPlan.name}</span>
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                clearPlannerState();
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-100">
            Saved as <span className="font-mono">{saveSuccess.name}</span>.{" "}
            <Link className="underline decoration-emerald-300/60 hover:decoration-emerald-200" href="/shipments">
              View shipments
            </Link>
          </p>
        </div>
      )}

      <SavePlanDialog
        open={isSaveDialogOpen}
        title="Save routed plan"
        summaryText={`${consolidationResult.shipments.length} shipments · ${consolidationResult.shipments.reduce(
          (acc, s) => acc + s.orders.length,
          0,
        )} orders`}
        onClose={() => setIsSaveDialogOpen(false)}
        mode="create"
        buildPayload={() => {
          const coords: Array<{ dcName: string; lat: number; lng: number }> = [];
          const seen = new Set<string>();
          for (const row of data.rawAddressMaster) {
            const dcName = String(row.dcName ?? row.DC ?? "").trim();
            if (!dcName || seen.has(dcName)) continue;
            const lat = Number(row.latitude ?? row.Latitude);
            const lng = Number(row.longitude ?? row.Longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            coords.push({ dcName, lat, lng });
            seen.add(dcName);
          }
          return {
            name: "",
            consolidationResult,
            inputs: data,
            dcCoordinates: coords,
          };
        }}
        onSaved={(meta) => setSaveSuccess(meta)}
      />

      {consolidationResult.shipments.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] shadow-inner shadow-black/30">
          <div className="flex items-center justify-between gap-3 border-b border-[#2a2a2a] bg-[#141414] px-4 py-2.5">
            <h3 className="text-sm font-bold text-[#e0e0e0]">Route map</h3>
              <button
                type="button"
                onClick={() => setIsMapFullscreen(true)}
                aria-label="Expand route map"
                className="inline-flex min-h-9 touch-manipulation items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs font-semibold text-[#e0e0e0] transition-[border-color,box-shadow,color] hover:border-[#1D9E75]/45 hover:text-[#1D9E75] hover:shadow-[0_0_14px_rgba(29,158,117,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D9E75]/40"
              >
              <Maximize2 className="size-3.5" aria-hidden />
              Expand
            </button>
          </div>
          <div className="p-3 sm:p-4">
            <PlannerShipmentsOverviewMap
              shipments={consolidationResult.shipments}
              dcCoordMap={dcCoordMap}
            />
          </div>
        </div>
      )}

      {isClientMounted &&
        isMapFullscreen &&
        consolidationResult.shipments.length > 0 &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0d0d0d]/90 p-3 backdrop-blur-sm sm:p-4"
            onClick={() => setIsMapFullscreen(false)}
          >
            <div
              className="flex h-[92vh] w-[96vw] max-w-7xl min-h-0 flex-col overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] shadow-2xl shadow-black/60"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="planner-map-dialog-title"
              ref={mapDialogRef}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#2a2a2a] bg-[#141414] px-3 py-2.5 sm:px-4 sm:py-3">
                <h3 id="planner-map-dialog-title" className="text-sm font-bold text-[#e0e0e0]">Route map</h3>
                <button
                  type="button"
                  aria-label="Close map"
                  onClick={() => setIsMapFullscreen(false)}
                  className="inline-flex min-h-9 min-w-9 touch-manipulation items-center justify-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2.5 py-1.5 text-xs font-semibold text-[#e0e0e0] transition-[border-color,color,box-shadow] hover:border-[#1D9E75]/45 hover:text-[#1D9E75] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D9E75]/40"
                  ref={mapDialogCloseRef}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
              <div className="min-h-0 flex-1 p-2 sm:p-3">
                <PlannerShipmentsOverviewMap
                  shipments={consolidationResult.shipments}
                  dcCoordMap={dcCoordMap}
                  mapHeightClassName="h-full"
                  edgeToEdge
                  showRouteStatus={false}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0d0d]">
        <div className="flex flex-wrap items-stretch border-b-[0.5px] border-[#2a2a2a]">
          <div className="flex min-w-0 flex-wrap">
            <button
              type="button"
              onClick={() => setResultsTab("dc")}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2 text-[12px] font-normal transition-colors",
                resultsTab === "dc"
                  ? "border-b-[#1D9E75] text-[#1D9E75]"
                  : "border-b-transparent text-[#888]",
              )}
            >
              By DC
              <span style={tabBadgeStyle(resultsTab === "dc")}>{dcSummaryRows.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setResultsTab("po")}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2 text-[12px] font-normal transition-colors",
                resultsTab === "po"
                  ? "border-b-[#1D9E75] text-[#1D9E75]"
                  : "border-b-transparent text-[#888]",
              )}
            >
              By PO
              <span style={tabBadgeStyle(resultsTab === "po")}>{poSummaryRows.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setResultsTab("unassigned")}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2 text-[12px] font-normal transition-colors",
                resultsTab === "unassigned"
                  ? "border-b-[#1D9E75] text-[#1D9E75]"
                  : "border-b-transparent text-[#888]",
              )}
            >
              Unassigned
              <span style={tabBadgeStyle(resultsTab === "unassigned")}>
                {consolidationResult.unassignedOrders.length}
              </span>
            </button>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 px-3.5 py-0 text-[11px] text-[#555]">
            <DragHandleDotsSvg className="shrink-0" />
            <span>Drag rows to reassign</span>
          </div>
        </div>
        {(warehouseTimeMotionError ||
          pickLoadSchedule.error ||
          moveError ||
          moveSuccess) && (
          <div className="border-b border-[#2a2a2a] bg-[#0d0d0d] px-4 py-2">
            {(warehouseTimeMotionError || pickLoadSchedule.error) && (
              <p className="text-xs text-amber-200/90" role="status">
                {warehouseTimeMotionError || pickLoadSchedule.error} Start Picking Time / PLT will show as &quot;—&quot;
                until fixed.
              </p>
            )}
            {moveError && (
              <p
                className={cn("text-xs text-rose-300", warehouseTimeMotionError || pickLoadSchedule.error ? "mt-2" : "")}
                role="alert"
              >
                {moveError}
              </p>
            )}
            {moveSuccess && (
              <p
                className={cn(
                  "text-xs text-emerald-300/90",
                  warehouseTimeMotionError || pickLoadSchedule.error || moveError ? "mt-2" : "",
                )}
                role="status"
              >
                {moveSuccess}
              </p>
            )}
          </div>
        )}

        <div className="om-results-table-scroll max-h-80 min-h-[200px] overflow-x-auto overflow-y-auto">
          {resultsTab === "unassigned" && consolidationResult.unassignedOrders.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[#555]">{"✓  All lines routed"}</p>
          ) : resultsTab === "unassigned" ? (
            <table className="w-full border-separate border-spacing-0 text-[12px] whitespace-nowrap">
              <thead className="sticky top-0 z-[1] border-b-[0.5px] border-[#2a2a2a] bg-[#161616] [&_th]:bg-[#161616]">
                <tr>
                  <th
                    className="w-8 px-3 py-2 text-center text-[11px] font-normal uppercase tracking-[0.04em] text-[#555]"
                    aria-hidden
                  />
                  {visibleColumns.map((col) => (
                    <th key={col.id} className={col.thClassName}>
                      {col.headerLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {consolidationResult.unassignedOrders.map((entry, index) => {
                  const o = entry.order;
                  return (
                    <tr
                      key={`unassigned-${index}`}
                      className="border-b-[0.5px] border-[#1e1e1e] shadow-[inset_2px_0_0_0_#ff9a7a] even:bg-[#0c0c0c] hover:bg-[#1a1a1a]"
                    >
                      <td className="w-8 px-3 py-2 text-center align-middle opacity-60">
                        <span className="inline-flex justify-center">
                          <DragHandleDotsSvg />
                        </span>
                      </td>
                      {visibleColumns.map((col) => (
                        <td key={col.id} className={col.tdClassName}>
                          {col.getValue(
                            { ...o, _reason: entry.reason, _overlaps: entry.overlapsSavedPlans },
                            index,
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : resultsTab === "dc" ? (
            dcSummaryRows.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-[#555]">No rows.</p>
            ) : (
              <table className="w-full border-separate border-spacing-0 text-[12px] whitespace-nowrap">
                <thead className="sticky top-0 z-[1] border-b-[0.5px] border-[#2a2a2a] bg-[#161616] [&_th]:bg-[#161616]">
                  <tr>
                    <th
                      className="w-8 px-3 py-2 text-center text-[11px] font-normal uppercase tracking-[0.04em] text-[#555]"
                      aria-hidden
                    />
                    {visibleColumns.map((col) => (
                      <th key={col.id} className={col.thClassName}>
                        {col.headerLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dcSummaryRows.map((row, index) => {
                    const rowKey = `dc-${row.shipmentId}-${row.dcName}`;
                    const isDragging = draggingRowKey === rowKey;
                    const isDropTarget =
                      dragOverShipmentId === row.shipmentId &&
                      dragPayload != null &&
                      dragPayload.sourceShipmentId !== row.shipmentId;
                    const grabCursor = isDragging || grabbingRowKey === rowKey;
                    return (
                      <tr
                        key={rowKey}
                        draggable
                        aria-label={`Reassign ${row.dcName} currently in ${row.shipmentId}`}
                        onDragStart={(event) => {
                          setDraggingRowKey(rowKey);
                          setDragPayload({ sourceShipmentId: row.shipmentId, dcName: row.dcName });
                          setMoveError(null);
                          setMoveSuccess(null);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "text/plain",
                            JSON.stringify({ sourceShipmentId: row.shipmentId, dcName: row.dcName }),
                          );
                        }}
                        onDragEnd={() => {
                          setDraggingRowKey(null);
                          setDragPayload(null);
                          setDragOverShipmentId(null);
                        }}
                        onDragOver={(event) => {
                          if (!dragPayload || dragPayload.sourceShipmentId === row.shipmentId) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragOverShipmentId(row.shipmentId);
                        }}
                        onDragLeave={() => {
                          setDragOverShipmentId((current) =>
                            current === row.shipmentId ? null : current,
                          );
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const payload = dragPayload;
                          setDragOverShipmentId(null);
                          setDraggingRowKey(null);
                          setDragPayload(null);
                          if (!payload) return;
                          void handleMoveDc(payload.sourceShipmentId, payload.dcName, row.shipmentId);
                        }}
                        className={cn(
                          "border-b-[0.5px] border-[#1e1e1e] transition-colors",
                          isDropTarget
                            ? "bg-[rgba(29,158,117,0.07)] shadow-[inset_2px_0_0_0_#1D9E75]"
                            : "even:bg-[#0c0c0c] hover:bg-[#1a1a1a]",
                          isDragging && "cursor-grabbing opacity-70",
                          !isDragging && (grabCursor ? "cursor-grabbing" : "cursor-grab"),
                        )}
                      >
                        <td
                          className="w-8 px-3 py-2 text-center align-middle"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setGrabbingRowKey(rowKey);
                          }}
                        >
                          <span className="inline-flex justify-center">
                            <DragHandleDotsSvg />
                          </span>
                        </td>
                        {visibleColumns.map((col) => (
                          <td key={col.id} className={col.tdClassName}>
                            {col.getValue(row, index)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : poSummaryRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[#555]">No rows.</p>
          ) : (
            <table className="w-full border-separate border-spacing-0 text-[12px] whitespace-nowrap">
              <thead className="sticky top-0 z-[1] border-b-[0.5px] border-[#2a2a2a] bg-[#161616] [&_th]:bg-[#161616]">
                <tr>
                  <th
                    className="w-8 px-3 py-2 text-center text-[11px] font-normal uppercase tracking-[0.04em] text-[#555]"
                    aria-hidden
                  />
                  {visibleColumns.map((col) => (
                    <th key={col.id} className={col.thClassName}>
                      {col.headerLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {poSummaryRows.map((row, index) => {
                  const rowKey = `po-${row.shipmentId}-${row.purchaseOrder}-${row.dcName}`;
                  const isDragging = draggingRowKey === rowKey;
                  const isDropTarget =
                    dragOverShipmentId === row.shipmentId &&
                    dragPayload != null &&
                    dragPayload.sourceShipmentId !== row.shipmentId;
                  const grabCursor = isDragging || grabbingRowKey === rowKey;
                  return (
                    <tr
                      key={rowKey}
                      draggable
                      aria-label={`Reassign ${row.dcName} currently in ${row.shipmentId}`}
                      onDragStart={(event) => {
                        setDraggingRowKey(rowKey);
                        setDragPayload({ sourceShipmentId: row.shipmentId, dcName: row.dcName });
                        setMoveError(null);
                        setMoveSuccess(null);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify({ sourceShipmentId: row.shipmentId, dcName: row.dcName }),
                        );
                      }}
                      onDragEnd={() => {
                        setDraggingRowKey(null);
                        setDragPayload(null);
                        setDragOverShipmentId(null);
                      }}
                      onDragOver={(event) => {
                        if (!dragPayload || dragPayload.sourceShipmentId === row.shipmentId) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverShipmentId(row.shipmentId);
                      }}
                      onDragLeave={() => {
                        setDragOverShipmentId((current) =>
                          current === row.shipmentId ? null : current,
                        );
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const payload = dragPayload;
                        setDragOverShipmentId(null);
                        setDraggingRowKey(null);
                        setDragPayload(null);
                        if (!payload) return;
                        void handleMoveDc(payload.sourceShipmentId, payload.dcName, row.shipmentId);
                      }}
                      className={cn(
                        "border-b-[0.5px] border-[#1e1e1e] transition-colors",
                        isDropTarget
                          ? "bg-[rgba(29,158,117,0.07)] shadow-[inset_2px_0_0_0_#1D9E75]"
                          : "even:bg-[#0c0c0c] hover:bg-[#1a1a1a]",
                        isDragging && "cursor-grabbing opacity-70",
                        !isDragging && (grabCursor ? "cursor-grabbing" : "cursor-grab"),
                      )}
                    >
                      <td
                        className="w-8 px-3 py-2 text-center align-middle"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setGrabbingRowKey(rowKey);
                        }}
                      >
                        <span className="inline-flex justify-center">
                          <DragHandleDotsSvg />
                        </span>
                      </td>
                      {visibleColumns.map((col) => (
                        <td key={col.id} className={col.tdClassName}>
                          {col.getValue(row, index)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
