import type {
  AddressRecord,
  ConsolidationResult,
  EnrichedOrderLine,
  ItemMasterRecord,
  OrderLine,
  PlannerDataState,
  RawAddressMasterCsvRow,
  RawItemMasterCsvRow,
  RawOrderCsvRow,
  RawTruckMasterCsvRow,
  SavedPlanOverlapRef,
  ServiceType,
  Shipment,
  ShipmentOrderLine,
  TruckType,
  UnassignedOrder,
} from "@/types/planner";
import {
  computeDropStops,
  microClusterComponentCount,
  microClusterRootByDc,
  minInterClusterKm,
  orderDropsForShortestPath,
  orderDropsNearestFromStart,
  shipmentWithinDropRules,
} from "@/lib/consolidation/distanceMatrix";
import {
  bestFeasibleSequence,
  dcWithShortestRegisterWindow,
  improveFeasibleSequenceByKmTwoOpt,
  parseHHmmToMinutes,
  shipmentTimeFeasible,
} from "@/lib/consolidation/timeWindow";
import { dcPldKey } from "@/lib/planner/savedPlanOverlap";
import type { PlannerRuntimeConfig } from "@/lib/consolidation/plannerRuntimeConfig";
import { DEFAULT_PLANNER_RUNTIME_CONFIG } from "@/lib/consolidation/plannerRuntimeConfig";

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: string | undefined): number | null {
  const text = (value ?? "").trim();
  if (!text || text === "-") return null;
  const normalized = text.replaceAll(",", "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickFirst(row: Record<string, string | undefined>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key]?.trim();
    if (value) return value;
  }
  return "";
}

function normalizeOrders(rows: RawOrderCsvRow[]): OrderLine[] {
  return rows.map((row) => {
    const desc = row.Desc?.trim();
    const pld = row.PLD?.trim() || row["Plan Loading Date"]?.trim() || "";
    const poExpiredDate =
      row["Expired PO"]?.trim() ||
      (row as unknown as Record<string, string | undefined>)["PO Expired Date"]?.trim() ||
      "";
    return {
      orderDate: row["Order Date"]?.trim() ?? "",
      ...(poExpiredDate ? { poExpiredDate } : {}),
      purchaseOrder: row["Purchase Order"]?.trim() ?? "",
      dcName: row["DC Name"]?.trim() ?? "",
      ...(pld ? { pld } : {}),
      address: row.Address?.trim(),
      origin: row.Origin?.trim(),
      item: row.Item?.trim() ?? "",
      ...(desc ? { itemDescription: desc } : {}),
      cases: toNumber(row.Cases),
    };
  });
}

function normalizeItemMaster(rows: RawItemMasterCsvRow[]): ItemMasterRecord[] {
  return rows.map((row) => ({
    item: row.ITEM?.trim() ?? "",
    cbm: toNumber(row.CBM),
    weightKg: toNumber(row["Weight (KG)"]),
  }));
}

function unloadDurationFromRow(row: RawAddressMasterCsvRow): number | null {
  const raw = row.unloadDurationMin;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  return toOptionalNumber(String(raw).trim()) ?? null;
}

export function normalizeAddressMaster(rows: RawAddressMasterCsvRow[]): AddressRecord[] {
  return rows.map((row) => {
    const r = row as unknown as Record<string, string | undefined>;
    return {
      dcName: pickFirst(r, ["DC", "dcName"]),
      latitude: toNumber(pickFirst(r, ["Latitude", "latitude"])),
      longitude: toNumber(pickFirst(r, ["Longitude", "longitude"])),
      origin: pickFirst(r, ["Origin"]),
      channelType: pickFirst(r, ["Channel Type"]),
      transportMode: pickFirst(r, ["Transport Mode", "transportmode"]),
      maxKgLtlLcl: toOptionalNumber(
        pickFirst(r, ["Max KG LTL/LCL", "Max KG LTL LCL", " Max KG LTL/LCL "]) || undefined,
      ),
      province: pickFirst(r, ["Province", "province"]),
      registerOpen: pickFirst(r, ["registerOpen", "Register Open", "Register open"]),
      registerClosed: pickFirst(r, ["registerClosed", "Register Closed", "Register closed"]),
      unloadDurationMin: unloadDurationFromRow(row),
      leadTimeFtlFcl: toOptionalNumber(
        pickFirst(r, ["leadtime_ftl/fcl", "leadtime_ftl_fcl", "leadtime ftl/fcl"]) || undefined,
      ),
      leadTimeLtlLcl: toOptionalNumber(
        pickFirst(r, ["leadtime_ltl/lcl", "leadtime_ltl_lcl", "leadtime ltl/lcl"]) || undefined,
      ),
    };
  });
}

function getShipmentMode(drops: string[], addressByDc: Map<string, AddressRecord>): "LAND" | "SEA" {
  const modes = new Set<string>();
  for (const dc of drops) {
    const mode = addressByDc.get(dc)?.transportMode?.trim().toUpperCase();
    if (mode) modes.add(mode);
  }
  if (modes.size === 1 && modes.has("SEA")) return "SEA";
  return "LAND";
}

function getLtlLclWeightCapKg(drops: string[], addressByDc: Map<string, AddressRecord>): number | null {
  const caps = drops
    .map((dc) => addressByDc.get(dc)?.maxKgLtlLcl ?? null)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (caps.length === 0) return null;
  return Math.min(...caps);
}

function resolveServiceType(
  drops: string[],
  totalWeightKg: number,
  addressByDc: Map<string, AddressRecord>,
): ServiceType {
  const mode = getShipmentMode(drops, addressByDc);
  const capKg = getLtlLclWeightCapKg(drops, addressByDc);
  // Primary classifier: only use DC LTL/LCL max KG caps when available.
  if (capKg !== null && capKg > 0) {
    const byCap = totalWeightKg <= capKg;
    if (mode === "SEA") return byCap ? "LCL" : "FCL";
    return byCap ? "LTL" : "FTL";
  }
  // If no cap is configured (empty/0), always classify as full-load.
  return mode === "SEA" ? "FCL" : "FTL";
}

function pickTruckByAliases(
  trucks: TruckType[],
  aliases: string[],
): TruckType | null {
  const normalizedAliases = aliases.map((v) => v.trim().toLowerCase());
  for (const candidate of trucks) {
    const normalized = candidate.truckType.trim().toLowerCase();
    if (normalizedAliases.includes(normalized)) return candidate;
  }
  return null;
}

function pickFclTruck(
  trucks: TruckType[],
  totalWeightKg: number,
  totalCbm: number,
  planner: PlannerRuntimeConfig,
): TruckType | null {
  const cont20 = pickTruckByAliases(trucks, planner.containerAliasesCont20);
  const cont40 = pickTruckByAliases(trucks, planner.containerAliasesCont40);
  const options = [cont20, cont40].filter((v): v is TruckType => v !== null);
  if (options.length === 0) return null;
  const fitting = options.find((t) => totalWeightKg <= t.maxKg && totalCbm <= t.maxCbm);
  if (fitting) return fitting;
  return options.sort((a, b) => a.maxKg + a.maxCbm - (b.maxKg + b.maxCbm))[options.length - 1] ?? null;
}

function isContainerTruckName(name: string, planner: PlannerRuntimeConfig): boolean {
  const normalized = name.trim().toLowerCase();
  const all = [...planner.containerAliasesCont20, ...planner.containerAliasesCont40].map((s) =>
    s.trim().toLowerCase(),
  );
  return all.includes(normalized);
}

function eligibleTrucksForMode(
  trucks: TruckType[],
  mode: "LAND" | "SEA",
  planner: PlannerRuntimeConfig,
): TruckType[] {
  if (mode === "SEA") {
    return trucks.filter((t) => isContainerTruckName(t.truckType, planner));
  }

  const landTrucks = trucks.filter((t) => !isContainerTruckName(t.truckType, planner));
  const ceiling = planner.landTruckCeilingName.trim().toLowerCase();
  const wingboxIdxInLand = landTrucks.findIndex((t) => t.truckType.trim().toLowerCase() === ceiling);
  if (wingboxIdxInLand < 0) return landTrucks;
  return landTrucks.slice(0, wingboxIdxInLand + 1);
}

function findSmallestFittingTruckForDrops(
  trucks: TruckType[],
  totalWeightKg: number,
  totalCbm: number,
  drops: Iterable<string>,
  addressByDc: Map<string, AddressRecord>,
  planner: PlannerRuntimeConfig,
): TruckType | undefined {
  const mode = getShipmentMode(Array.from(drops), addressByDc);
  const eligible = eligibleTrucksForMode(trucks, mode, planner);
  return findSmallestFittingTruck(eligible, totalWeightKg, totalCbm);
}

function findLargestTruckForDrops(
  trucks: TruckType[],
  drops: Iterable<string>,
  addressByDc: Map<string, AddressRecord>,
  planner: PlannerRuntimeConfig,
): TruckType | undefined {
  const mode = getShipmentMode(Array.from(drops), addressByDc);
  const eligible = eligibleTrucksForMode(trucks, mode, planner);
  if (eligible.length === 0) return undefined;
  return eligible[eligible.length - 1];
}

function splitOrderIntoFittingLoads(order: OrderLine, item: ItemMasterRecord, truck: TruckType): EnrichedOrderLine[] {
  const maxCasesByKg = item.weightKg > 0 ? truck.maxKg / item.weightKg : Number.POSITIVE_INFINITY;
  const maxCasesByCbm = item.cbm > 0 ? truck.maxCbm / item.cbm : Number.POSITIVE_INFINITY;
  const maxCasesPerLoad = Math.floor(Math.min(maxCasesByKg, maxCasesByCbm));

  if (!Number.isFinite(maxCasesPerLoad) || maxCasesPerLoad < 1) {
    return [];
  }

  const loads: EnrichedOrderLine[] = [];
  let remainingCases = order.cases;
  const epsilon = 1e-9;

  while (remainingCases > epsilon) {
    const nextCases = Math.min(remainingCases, maxCasesPerLoad);
    if (nextCases <= epsilon) break;
    loads.push({
      ...order,
      cases: nextCases,
      totalCbm: nextCases * item.cbm,
      totalWeightKg: nextCases * item.weightKg,
    });
    remainingCases = Number((remainingCases - nextCases).toFixed(6));
  }

  return loads;
}

function partitionClusterIntoFittingGroups(
  lines: EnrichedOrderLine[],
  trucks: TruckType[],
  addressByDc: Map<string, AddressRecord>,
  planner: PlannerRuntimeConfig,
): { groups: EnrichedOrderLine[][]; leftovers: EnrichedOrderLine[] } {
  const ordered = [...lines].sort((a, b) => b.totalWeightKg + b.totalCbm - (a.totalWeightKg + a.totalCbm));
  const groups: EnrichedOrderLine[][] = [];
  const leftovers: EnrichedOrderLine[] = [];

  for (const line of ordered) {
    let placed = false;
    for (const group of groups) {
      const merged = [...group, line];
      const totalWeight = merged.reduce((acc, item) => acc + item.totalWeightKg, 0);
      const totalCbm = merged.reduce((acc, item) => acc + item.totalCbm, 0);
      const fit = findSmallestFittingTruckForDrops(
        trucks,
        totalWeight,
        totalCbm,
        merged.map((item) => item.dcName),
        addressByDc,
        planner,
      );
      if (!fit) continue;
      group.push(line);
      placed = true;
      break;
    }

    if (placed) continue;

    const singleFit = findSmallestFittingTruckForDrops(
      trucks,
      line.totalWeightKg,
      line.totalCbm,
      [line.dcName],
      addressByDc,
      planner,
    );
    if (!singleFit) {
      leftovers.push(line);
      continue;
    }

    groups.push([line]);
  }

  return { groups, leftovers };
}

function derivePresentationFromServiceType(
  serviceType: ServiceType,
  trucks: TruckType[],
  fallbackTruck: TruckType,
  totalWeightKg: number,
  totalCbm: number,
  planner: PlannerRuntimeConfig,
): { truckType: string; cbmUtilizationPct: number; weightUtilizationPct: number } {
  if (serviceType === "LTL" || serviceType === "LCL") {
    return {
      truckType: serviceType,
      cbmUtilizationPct: 0,
      weightUtilizationPct: 0,
    };
  }

  if (serviceType === "FTL") {
    return {
      truckType: fallbackTruck.truckType,
      cbmUtilizationPct: Number(((totalCbm / fallbackTruck.maxCbm) * 100).toFixed(2)),
      weightUtilizationPct: Number(((totalWeightKg / fallbackTruck.maxKg) * 100).toFixed(2)),
    };
  }

  const fclTruck = pickFclTruck(trucks, totalWeightKg, totalCbm, planner);
  const basis = fclTruck ?? fallbackTruck;
  return {
    truckType: fclTruck?.truckType ?? planner.fclFallbackTruckType,
    cbmUtilizationPct: Number(((totalCbm / basis.maxCbm) * 100).toFixed(2)),
    weightUtilizationPct: Number(((totalWeightKg / basis.maxKg) * 100).toFixed(2)),
  };
}

export function normalizeTruckMaster(rows: RawTruckMasterCsvRow[]): TruckType[] {
  return rows
    .map((row) => ({
      truckType: row["Truck Type"]?.trim() ?? "",
      maxKg: toNumber(row.Kg),
      maxCbm: toNumber(row.CBM),
    }))
    .filter((row) => row.truckType && row.maxKg > 0 && row.maxCbm > 0)
    .sort((a, b) => a.maxKg + a.maxCbm - (b.maxKg + b.maxCbm));
}

function findSmallestFittingTruck(
  trucks: TruckType[],
  totalWeightKg: number,
  totalCbm: number,
): TruckType | undefined {
  return trucks.find((truck) => totalWeightKg <= truck.maxKg && totalCbm <= truck.maxCbm);
}

/** Index of baseline "CDD" row in capacity-sorted truck list (-1 if missing). */
function cddBaselineIndex(trucks: TruckType[]): number {
  return trucks.findIndex((t) => t.truckType.trim().toLowerCase() === "cdd");
}

function truckRankIndex(trucks: TruckType[], truck: TruckType): number {
  return trucks.findIndex((t) => t.truckType === truck.truckType);
}

/** True if this truck class is strictly larger than CDD in the master ordering (e.g. CDD Long, Fuso). */
function isTruckAboveCdd(trucks: TruckType[], truck: TruckType): boolean {
  const cddIdx = cddBaselineIndex(trucks);
  if (cddIdx < 0) return false;
  const idx = truckRankIndex(trucks, truck);
  return idx > cddIdx;
}

/**
 * Effective physical stops for policy (multidrop / CDD): uses the same 0.3 km micro-cluster rule as
 * the driving matrix — DC names closer than that count as one drop (same warehouse, different address).
 */
function effectivePhysicalDropCount(
  lines: EnrichedOrderLine[],
  drivingDistanceKm: Map<string, number> | undefined,
  planner: PlannerRuntimeConfig,
): number {
  const drops = new Set(lines.map((o) => o.dcName.trim()).filter(Boolean));
  if (drivingDistanceKm && drivingDistanceKm.size > 0) {
    return microClusterComponentCount(drops, drivingDistanceKm, planner.microClusterThresholdKm);
  }
  return drops.size;
}

/** Multidrop (2+ effective physical stops) is not allowed on trucks above CDD capacity class. */
function multidropForbiddenForTruck(
  lines: EnrichedOrderLine[],
  truck: TruckType,
  trucks: TruckType[],
  drivingDistanceKm: Map<string, number> | undefined,
  planner: PlannerRuntimeConfig,
): boolean {
  return effectivePhysicalDropCount(lines, drivingDistanceKm, planner) > 1 && isTruckAboveCdd(trucks, truck);
}

function mixedOrSingle(values: string[]): string {
  const uniq = Array.from(new Set(values.filter(Boolean)));
  return uniq.length === 1 ? uniq[0]! : "MIXED";
}

function normalizeShipmentIdToken(value: string | undefined): string {
  const raw = (value ?? "").trim().toUpperCase();
  const normalized = raw.replace(/[^A-Z0-9]/g, "");
  return normalized || "UNKNOWN";
}

function buildShipmentId(
  counters: Map<string, number>,
  provinceName: string | undefined,
  truckType: string,
): string {
  const date = new Date();
  const y = String(date.getFullYear()).slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const dateToken = `${y}${m}${d}`;
  const key = `S__${dateToken}`;
  const next = (counters.get(key) ?? 0) + 1;
  counters.set(key, next);
  const provinceToken = normalizeShipmentIdToken(provinceName);
  const truckToken = normalizeShipmentIdToken(truckType);
  return `${provinceToken}-${truckToken}-${String(next).padStart(4, "0")}`;
}

function minutesToHHmm(minutes: number): string {
  const total = Math.max(0, Math.min(Math.floor(minutes), 47 * 60 + 59));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseDateInput(value: string | undefined): Date | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  // IMPORTANT: Avoid `new Date("YYYY-MM-DD")` timezone-dependent behavior.
  // Normalize date-only strings to a local Date so computations are stable across runtimes (Vercel/local).
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (isoDateOnly) {
    const year = Number(isoDateOnly[1]);
    const month = Number(isoDateOnly[2]);
    const day = Number(isoDateOnly[3]);
    const normalized = new Date(year, month - 1, day);
    return Number.isNaN(normalized.getTime()) ? null : normalized;
  }
  const isoSlashDateOnly = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(raw);
  if (isoSlashDateOnly) {
    const year = Number(isoSlashDateOnly[1]);
    const month = Number(isoSlashDateOnly[2]);
    const day = Number(isoSlashDateOnly[3]);
    const normalized = new Date(year, month - 1, day);
    return Number.isNaN(normalized.getTime()) ? null : normalized;
  }
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(raw);
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

function formatDateYYYYMMDD(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function addDaysToDateString(baseDate: string | undefined, days: number | null): string | undefined {
  if (days == null || !Number.isFinite(days)) return undefined;
  const date = parseDateInput(baseDate);
  if (!date) return undefined;
  const next = new Date(date);
  next.setDate(next.getDate() + Math.round(days));
  // Business rule: when RAD falls on Sunday, move it to Monday.
  if (next.getDay() === 0) {
    next.setDate(next.getDate() + 1);
  }
  return formatDateYYYYMMDD(next);
}

type DropRoutingProjection = {
  representativeByDc: Map<string, string>;
  routingDrops: string[];
  timeAddressByRoutingDrop: Map<string, AddressRecord>;
};

function buildDropRoutingProjection(
  drops: string[],
  drivingDistanceKm: Map<string, number> | undefined,
  addressByDc: Map<string, AddressRecord>,
  planner: PlannerRuntimeConfig,
): DropRoutingProjection {
  const uniq = Array.from(new Set(drops.map((d) => d.trim()).filter(Boolean)));
  const representativeByDc = new Map<string, string>(uniq.map((dc) => [dc, dc]));
  const timeAddressByRoutingDrop = new Map<string, AddressRecord>();

  if (!drivingDistanceKm || drivingDistanceKm.size === 0 || uniq.length <= 1) {
    for (const dc of uniq) {
      const addr = addressByDc.get(dc);
      if (addr) timeAddressByRoutingDrop.set(dc, addr);
    }
    return { representativeByDc, routingDrops: uniq, timeAddressByRoutingDrop };
  }

  const rootByDc = microClusterRootByDc(uniq, drivingDistanceKm, planner.microClusterThresholdKm);
  const membersByRoot = new Map<string, string[]>();
  for (const dc of uniq) {
    const root = rootByDc.get(dc) ?? dc;
    const list = membersByRoot.get(root) ?? [];
    list.push(dc);
    membersByRoot.set(root, list);
  }

  const representativeByRoot = new Map<string, string>();
  for (const [root, members] of membersByRoot) {
    const sorted = members.slice().sort((a, b) => a.localeCompare(b));
    representativeByRoot.set(root, sorted[0]!);
    for (const dc of members) {
      representativeByDc.set(dc, sorted[0]!);
    }
  }

  const routingDrops = Array.from(new Set(uniq.map((dc) => representativeByDc.get(dc) ?? dc)));

  for (const [root, members] of membersByRoot) {
    const representative = representativeByRoot.get(root);
    if (!representative) continue;
    const candidateAddresses = members
      .map((memberDc) => addressByDc.get(memberDc))
      .filter((addr): addr is AddressRecord => addr !== undefined);
    const base = addressByDc.get(representative) ?? candidateAddresses[0];
    if (!base) continue;

    const opens = candidateAddresses
      .map((addr) => parseHHmmToMinutes(addr.registerOpen))
      .filter((v): v is number => v !== null);
    const closes = candidateAddresses
      .map((addr) => parseHHmmToMinutes(addr.registerClosed))
      .filter((v): v is number => v !== null);
    const unloads = candidateAddresses
      .map((addr) => addr.unloadDurationMin)
      .filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0);

    timeAddressByRoutingDrop.set(representative, {
      ...base,
      registerOpen: opens.length > 0 ? minutesToHHmm(Math.min(...opens)) : base.registerOpen,
      registerClosed: closes.length > 0 ? minutesToHHmm(Math.max(...closes)) : base.registerClosed,
      unloadDurationMin: unloads.length > 0 ? Math.max(...unloads) : base.unloadDurationMin,
    });
  }

  return { representativeByDc, routingDrops, timeAddressByRoutingDrop };
}

function toShipment(
  id: string,
  orders: EnrichedOrderLine[],
  truck: TruckType,
  trucks: TruckType[],
  drivingDistanceKm: Map<string, number> | undefined,
  drivingDurationMin: Map<string, number> | undefined,
  addressByDc: Map<string, AddressRecord>,
  planner: PlannerRuntimeConfig,
): Shipment {
  const orderDate = mixedOrSingle(orders.map((order) => order.orderDate));
  const shipmentOrigin = mixedOrSingle(orders.map((order) => (order.origin ?? "").trim()));
  const singleShipmentOrigin = shipmentOrigin !== "MIXED" ? shipmentOrigin : "";
  const dropsUnique = Array.from(new Set(orders.map((order) => order.dcName)));
  const routingProjection = buildDropRoutingProjection(
    dropsUnique,
    drivingDistanceKm,
    addressByDc,
    planner,
  );
  const routingDropsUnique = routingProjection.routingDrops;
  const timeAddressByRoutingDrop = routingProjection.timeAddressByRoutingDrop;

  let drops: string[];
  let tripDurationMin: number | null = null;
  let timeSchedule:
    | Array<{
        legFromPreviousMin: number | null;
        arriveMin: number;
        unloadStartMin: number;
        departMin: number;
      }>
    | null = null;

  const hasDistanceMatrix = drivingDistanceKm !== undefined && drivingDistanceKm.size > 0;
  const hasDurationMatrix = drivingDurationMin !== undefined && drivingDurationMin.size > 0;
  const best =
    hasDistanceMatrix && hasDurationMatrix
      ? bestFeasibleSequence(routingDropsUnique, timeAddressByRoutingDrop, drivingDurationMin, planner)
      : null;

  if (best) {
    const refined =
      drivingDistanceKm && drivingDistanceKm.size > 0 && drivingDurationMin
        ? improveFeasibleSequenceByKmTwoOpt(
            best.sequence,
            timeAddressByRoutingDrop,
            drivingDurationMin,
            drivingDistanceKm,
            planner,
          )
        : null;
    const chosen = refined ?? best;
    drops = chosen.sequence;
    tripDurationMin = chosen.tripDurationMin;
    timeSchedule = chosen.perStop.map((p) => ({
      legFromPreviousMin: p.legFromPreviousMin,
      arriveMin: p.arriveMin,
      unloadStartMin: p.unloadStartMin,
      departMin: p.departMin,
    }));
  } else {
    const fixedFirst = dcWithShortestRegisterWindow(routingDropsUnique, timeAddressByRoutingDrop);
    if (fixedFirst !== null && routingDropsUnique.length > 1) {
      drops = orderDropsNearestFromStart(fixedFirst, routingDropsUnique, drivingDistanceKm);
    } else {
      drops = orderDropsForShortestPath(routingDropsUnique, drivingDistanceKm);
    }
  }

  const dropOrder = new Map(drops.map((drop, index) => [drop, index + 1]));

  const totalCbm = orders.reduce((acc, order) => acc + order.totalCbm, 0);
  const totalWeightKg = orders.reduce((acc, order) => acc + order.totalWeightKg, 0);
  const serviceType = resolveServiceType(dropsUnique, totalWeightKg, addressByDc);
  const presentation = derivePresentationFromServiceType(
    serviceType,
    trucks,
    truck,
    totalWeightKg,
    totalCbm,
    planner,
  );

  const shipmentOrders: ShipmentOrderLine[] = orders.map((order) => {
    const address = addressByDc.get(order.dcName);
    const leadTimeDays =
      serviceType === "LTL" || serviceType === "LCL"
        ? address?.leadTimeLtlLcl ?? null
        : address?.leadTimeFtlFcl ?? null;
    const rad = addDaysToDateString(order.pld, leadTimeDays);
    return {
      ...order,
      dropSequence: dropOrder.get(routingProjection.representativeByDc.get(order.dcName) ?? order.dcName) ?? 1,
      ...(rad ? { rad } : {}),
    };
  });

  const baseStops = computeDropStops(
    drops,
    drivingDistanceKm,
    drivingDurationMin,
    singleShipmentOrigin || null,
  );
  const dropStops = baseStops.map((stop, i) => {
    const t = timeSchedule?.[i];
    return {
      ...stop,
      legFromPreviousMin: t?.legFromPreviousMin ?? stop.legFromPreviousMin,
      arriveMin: t?.arriveMin ?? null,
      unloadStartMin: t?.unloadStartMin ?? null,
      departMin: t?.departMin ?? null,
    };
  });

  return {
    id,
    orderDate,
    truckType: presentation.truckType,
    serviceType,
    totalCbm,
    totalWeightKg,
    cbmUtilizationPct: presentation.cbmUtilizationPct,
    weightUtilizationPct: presentation.weightUtilizationPct,
    drops,
    dropStops,
    orders: shipmentOrders,
    tripDurationMin,
  };
}

export function recomputeShipmentFromOrders(
  id: string,
  orders: EnrichedOrderLine[],
  trucks: TruckType[],
  drivingDistanceKm: Map<string, number> | undefined,
  addressByDc: Map<string, AddressRecord> = new Map(),
  drivingDurationMin?: Map<string, number>,
  planner: PlannerRuntimeConfig = DEFAULT_PLANNER_RUNTIME_CONFIG,
): { shipment: Shipment | null; error?: string } {
  if (orders.length === 0) {
    return { shipment: null };
  }

  const totalWeightKg = orders.reduce((acc, order) => acc + order.totalWeightKg, 0);
  const totalCbm = orders.reduce((acc, order) => acc + order.totalCbm, 0);
  const drops = new Set(orders.map((order) => order.dcName));
  const truck = findSmallestFittingTruckForDrops(
    trucks,
    totalWeightKg,
    totalCbm,
    drops,
    addressByDc,
    planner,
  );
  if (!truck) {
    return { shipment: null, error: "Unable to find truck for shipment totals" };
  }

  if (!shipmentWithinDropRules(drops, drivingDistanceKm, planner)) {
    return {
      shipment: null,
      error: "Exceeds per-shipment drop rules for this DC set (driving matrix / distance limits)",
    };
  }

  if (multidropForbiddenForTruck(orders, truck, trucks, drivingDistanceKm, planner)) {
    return {
      shipment: null,
      error: "Multidrop not allowed when smallest fitting truck is above CDD class",
    };
  }

  const timeRoutingProjection = buildDropRoutingProjection(
    [...drops],
    drivingDistanceKm,
    addressByDc,
    planner,
  );
  if (
    !shipmentTimeFeasible(
      new Set(timeRoutingProjection.routingDrops),
      timeRoutingProjection.timeAddressByRoutingDrop,
      drivingDurationMin,
      planner,
    )
  ) {
    return {
      shipment: null,
      error:
        "No time-feasible drop sequence for this multidrop (register windows incl. 1h-before-close buffer on 2nd+ stops / drive durations / unload times)",
    };
  }

  return {
    shipment: toShipment(
      id,
      orders,
      truck,
      trucks,
      drivingDistanceKm,
      drivingDurationMin,
      addressByDc,
      planner,
    ),
  };
}

export function runConsolidation(
  data: PlannerDataState,
  options?: {
    drivingDistanceKm?: Map<string, number>;
    drivingDurationMin?: Map<string, number>;
    planner?: PlannerRuntimeConfig;
    /**
     * Lowercased, trimmed PO numbers that should be rejected (already exist in saved plans).
     * Use `savedPlanPoIndex` instead when you want the chip metadata too — when both are
     * provided, `savedPlanPoIndex` takes precedence.
     */
    blockedPurchaseOrders?: Set<string>;
    /**
     * Saved-plan POs keyed by normalized PO -> overlap refs. When provided, the duplicate-PO
     * guard uses this map's keys for blocking and attaches the refs to the unassigned record
     * so the UI can render the "Overlaps saved plan" chip.
     */
    savedPlanPoIndex?: Map<string, SavedPlanOverlapRef[]>;
    /**
     * Saved-plan (DC, PLD) cells keyed by `dcPldKey(dc, pldIso)` -> overlap refs. When set, any
     * new order whose (DC, PLD) is in this map is held back from the multidrop merge and emitted
     * as its own single-(DC, PLD) shipment (one shipment per quarantined key), with the refs
     * attached as `overlapsSavedPlans` so the UI can render the chip.
     */
    savedPlanDcPldIndex?: Map<string, SavedPlanOverlapRef[]>;
  },
): ConsolidationResult {
  const planner = options?.planner ?? DEFAULT_PLANNER_RUNTIME_CONFIG;
  const drivingDistanceKm = options?.drivingDistanceKm;
  const drivingDurationMin = options?.drivingDurationMin;
  const savedPlanPoIndex = options?.savedPlanPoIndex;
  const blockedPoSet = savedPlanPoIndex ?? options?.blockedPurchaseOrders;
  const savedPlanDcPldIndex = options?.savedPlanDcPldIndex;
  const orders = normalizeOrders(data.rawOrders);
  const itemMaster = normalizeItemMaster(data.rawItemMaster);
  const addressMaster = normalizeAddressMaster(data.rawAddressMaster);
  const trucks = normalizeTruckMaster(data.rawTruckMaster);

  const itemMap = new Map<string, ItemMasterRecord>(itemMaster.map((item) => [item.item, item]));
  const addressMap = new Map<string, AddressRecord>(
    addressMaster.map((address) => [address.dcName, address]),
  );

  const unassignedOrders: UnassignedOrder[] = [];
  const enrichedOrders: EnrichedOrderLine[] = [];

  for (const order of orders) {
    if (blockedPoSet) {
      const poKey = order.purchaseOrder.trim().toLocaleLowerCase();
      if (poKey && blockedPoSet.has(poKey)) {
        const refs = savedPlanPoIndex?.get(poKey) ?? [];
        const record: UnassignedOrder = {
          order,
          reason: `Duplicate PO Number '${order.purchaseOrder}' already exists in saved plans`,
        };
        if (refs.length > 0) {
          record.overlapsSavedPlans = refs.map((r) => ({ ...r }));
        }
        unassignedOrders.push(record);
        continue;
      }
    }

    const item = itemMap.get(order.item);
    if (!item) {
      unassignedOrders.push({ order, reason: `Missing item master for item '${order.item}'` });
      continue;
    }
    const address = addressMap.get(order.dcName);
    if (!address) {
      unassignedOrders.push({
        order,
        reason: `Missing address master for DC '${order.dcName}'`,
      });
      continue;
    }

    const province = address.province?.trim() ?? "";
    const enriched: EnrichedOrderLine = {
      ...order,
      province,
      totalCbm: order.cases * item.cbm,
      totalWeightKg: order.cases * item.weightKg,
    };

    const canFitAny = findSmallestFittingTruckForDrops(
      trucks,
      enriched.totalWeightKg,
      enriched.totalCbm,
      [enriched.dcName],
      addressMap,
      planner,
    );
    if (canFitAny) {
      enrichedOrders.push(enriched);
      continue;
    }

    const largestTruck = findLargestTruckForDrops(trucks, [enriched.dcName], addressMap, planner);
    if (!largestTruck) {
      unassignedOrders.push({ order: enriched, reason: "Order exceeds largest truck capacity" });
      continue;
    }

    const splitLoads = splitOrderIntoFittingLoads(order, item, largestTruck);
    if (splitLoads.length === 0) {
      unassignedOrders.push({ order: enriched, reason: "Single case exceeds largest truck capacity" });
      continue;
    }

    enrichedOrders.push(...splitLoads.map((line) => ({ ...line, province })));
  }

  // Quarantine pass: orders whose (DC, PLD) appears in the saved-plan index are held back from the
  // multidrop merge. Each quarantine bucket is finalized as its own single-(DC, PLD) shipment(s)
  // after the regular merge loop completes; refs are attached as `overlapsSavedPlans` on the
  // resulting shipment(s).
  const regularEnriched: EnrichedOrderLine[] = [];
  const quarantinedByKey = new Map<string, EnrichedOrderLine[]>();
  for (const enriched of enrichedOrders) {
    const pldRaw = (enriched.pld ?? "").trim();
    if (savedPlanDcPldIndex && pldRaw) {
      const key = dcPldKey(enriched.dcName, pldRaw);
      if (savedPlanDcPldIndex.has(key)) {
        const list = quarantinedByKey.get(key) ?? [];
        list.push(enriched);
        quarantinedByKey.set(key, list);
        continue;
      }
    }
    regularEnriched.push(enriched);
  }

  const shipments: Shipment[] = [];
  const shipmentIdCounters = new Map<string, number>();

  const sortedOrders = [...regularEnriched].sort(
    (a, b) => b.totalCbm + b.totalWeightKg - (a.totalCbm + a.totalWeightKg),
  );

  const uniqueDcs = [...new Set(sortedOrders.map((o) => o.dcName))];
  const rootByDc = microClusterRootByDc(
    uniqueDcs,
    drivingDistanceKm,
    planner.microClusterThresholdKm,
  );
  const clusterMap = new Map<string, EnrichedOrderLine[]>();
  for (const order of sortedOrders) {
    const root = rootByDc.get(order.dcName) ?? order.dcName;
    const list = clusterMap.get(root) ?? [];
    list.push(order);
    clusterMap.set(root, list);
  }
  const clusters = [...clusterMap.values()];

  const dropsOf = (lines: EnrichedOrderLine[]) => new Set(lines.map((o) => o.dcName));

  /** Minimum matrix km between any DC in `a` and any DC in `b`; +∞ if unknown (no matrix / missing legs). */
  const pairSeparationKm = (a: EnrichedOrderLine[], b: EnrichedOrderLine[]): number => {
    const raw = minInterClusterKm(dropsOf(a), dropsOf(b), drivingDistanceKm);
    return raw !== undefined && Number.isFinite(raw) ? raw : Number.POSITIVE_INFINITY;
  };

  let groups: EnrichedOrderLine[][] = clusters.map((c) => c.slice());

  const finalizeClusterLines = (lines: EnrichedOrderLine[]) => {
    if (lines.length === 0) return;
    const totalWeight = lines.reduce((acc, order) => acc + order.totalWeightKg, 0);
    const totalCbm = lines.reduce((acc, order) => acc + order.totalCbm, 0);
    const truck = findSmallestFittingTruckForDrops(
      trucks,
      totalWeight,
      totalCbm,
      lines.map((o) => o.dcName),
      addressMap,
      planner,
    );
    if (!truck) {
      const repartitioned = partitionClusterIntoFittingGroups(lines, trucks, addressMap, planner);
      for (const order of repartitioned.leftovers) {
        unassignedOrders.push({ order, reason: "Order exceeds largest truck capacity" });
      }
      groups.push(...repartitioned.groups);
      return;
    }

    const shipmentProvince = mixedOrSingle(lines.map((line) => line.province?.trim() ?? ""));
    const shipmentDrops = Array.from(new Set(lines.map((line) => line.dcName)));
    const shipmentServiceType = resolveServiceType(
      shipmentDrops,
      totalWeight,
      addressMap,
    );
    const shipmentTruckTypeForId = shipmentServiceType === "LTL" ? "LTL" : truck.truckType;
    const shipmentId = buildShipmentId(shipmentIdCounters, shipmentProvince, shipmentTruckTypeForId);
    const rec = recomputeShipmentFromOrders(
      shipmentId,
      lines,
      trucks,
      drivingDistanceKm,
      addressMap,
      drivingDurationMin,
      planner,
    );
    if (rec.shipment) {
      shipments.push(rec.shipment);
      return;
    }

    const err = rec.error ?? "Unable to build shipment";
    if (
      err === "Multidrop not allowed when smallest fitting truck is above CDD class" &&
      effectivePhysicalDropCount(lines, drivingDistanceKm, planner) > 1
    ) {
      const byDc = new Map<string, EnrichedOrderLine[]>();
      for (const line of lines) {
        const list = byDc.get(line.dcName) ?? [];
        list.push(line);
        byDc.set(line.dcName, list);
      }
      groups.push(...byDc.values());
      return;
    }

    for (const order of lines) {
      unassignedOrders.push({ order, reason: err });
    }
  };

  const MERGE_NEIGHBOR_LIMIT = 6;

  const fastMergePrecheck = (merged: EnrichedOrderLine[]): boolean => {
    if (merged.length === 0) return false;
    const totalWeight = merged.reduce((acc, order) => acc + order.totalWeightKg, 0);
    const totalCbm = merged.reduce((acc, order) => acc + order.totalCbm, 0);
    const drops = new Set(merged.map((o) => o.dcName));

    const truck = findSmallestFittingTruckForDrops(
      trucks,
      totalWeight,
      totalCbm,
      drops,
      addressMap,
      planner,
    );
    if (!truck) return false;

    if (!shipmentWithinDropRules(drops, drivingDistanceKm, planner)) return false;
    if (multidropForbiddenForTruck(merged, truck, trucks, drivingDistanceKm, planner)) return false;
    return true;
  };

  while (groups.length > 0) {
    groups = groups.flatMap((g) => {
      const totalWeight = g.reduce((acc, order) => acc + order.totalWeightKg, 0);
      const totalCbm = g.reduce((acc, order) => acc + order.totalCbm, 0);
      const fitTruck = findSmallestFittingTruckForDrops(
        trucks,
        totalWeight,
        totalCbm,
        g.map((o) => o.dcName),
        addressMap,
        planner,
      );
      if (fitTruck) return [g];
      const repartitioned = partitionClusterIntoFittingGroups(g, trucks, addressMap, planner);
      for (const order of repartitioned.leftovers) {
        unassignedOrders.push({ order, reason: "Order exceeds largest truck capacity" });
      }
      return repartitioned.groups;
    });

    if (groups.length === 0) break;

    if (groups.length === 1) {
      const only = groups[0]!;
      groups = [];
      finalizeClusterLines(only);
      continue;
    }

    let bestI = -1;
    let bestJ = -1;
    let bestKm = Number.POSITIVE_INFINITY;

    const betterPair = (km: number, i: number, j: number): boolean => {
      if (bestI < 0) return true;
      if (km < bestKm - 1e-9) return true;
      if (km > bestKm + 1e-9) return false;
      if (i < bestI) return true;
      if (i > bestI) return false;
      return j < bestJ;
    };

    const candidatesByI = new Map<number, Array<{ j: number; km: number }>>();
    for (let i = 0; i < groups.length; i += 1) {
      const arr: Array<{ j: number; km: number }> = [];
      for (let j = 0; j < groups.length; j += 1) {
        if (i === j) continue;
        arr.push({ j, km: pairSeparationKm(groups[i]!, groups[j]!) });
      }
      arr.sort((a, b) => a.km - b.km);
      candidatesByI.set(i, arr.slice(0, Math.max(2, MERGE_NEIGHBOR_LIMIT)));
    }

    const considered = new Set<string>();
    for (let i = 0; i < groups.length; i += 1) {
      const cand = candidatesByI.get(i) ?? [];
      for (const { j, km } of cand) {
        const a = Math.min(i, j);
        const b = Math.max(i, j);
        const key = `${a}:${b}`;
        if (considered.has(key)) continue;
        considered.add(key);

        const gi = groups[a]!;
        const gj = groups[b]!;
        const mergedProbe = [...gi, ...gj];

        // Avoid expensive routing/time feasibility checks when merge can't ever fit.
        if (!fastMergePrecheck(mergedProbe)) continue;

        const probe = recomputeShipmentFromOrders(
          "__nn_pair__",
          mergedProbe,
          trucks,
          drivingDistanceKm,
          addressMap,
          drivingDurationMin,
          planner,
        );
        if (!probe.shipment) continue;

        if (betterPair(km, a, b)) {
          bestI = a;
          bestJ = b;
          bestKm = km;
        }
      }
    }

    if (bestI < 0) {
      const snapshot = groups.slice();
      groups = [];
      for (const g of snapshot) {
        finalizeClusterLines(g);
      }
      continue;
    }

    const lo = Math.min(bestI, bestJ);
    const hi = Math.max(bestI, bestJ);
    const mergedLines = [...groups[lo]!, ...groups[hi]!];
    groups = groups.filter((_, idx) => idx !== lo && idx !== hi);
    groups.push(mergedLines);
  }

  // Quarantine pass: emit one shipment per (DC, PLD) bucket. These never merge with each other or
  // with the regular pool. We reuse `finalizeClusterLines` (which can push back into `groups` for
  // bucket partitioning), so we drain `groups` per-bucket. Tagging happens in a single post-pass
  // below so we also catch unassigned records added during the per-order enrichment loop (e.g.
  // an oversized quarantined order that never reached the cluster phase).
  if (savedPlanDcPldIndex && quarantinedByKey.size > 0) {
    for (const [, lines] of quarantinedByKey) {
      groups = [lines];
      while (groups.length > 0) {
        const next = groups.shift()!;
        finalizeClusterLines(next);
      }
    }
  }

  if (savedPlanDcPldIndex && savedPlanDcPldIndex.size > 0) {
    const lookupRefs = (dcName: string, pld: string | undefined): SavedPlanOverlapRef[] | null => {
      const pldRaw = (pld ?? "").trim();
      if (!pldRaw) return null;
      const refs = savedPlanDcPldIndex.get(dcPldKey(dcName, pldRaw));
      return refs && refs.length > 0 ? refs : null;
    };
    for (const shipment of shipments) {
      if (shipment.overlapsSavedPlans) continue;
      const first = shipment.orders[0];
      if (!first) continue;
      const refs = lookupRefs(first.dcName, first.pld);
      if (refs) {
        shipment.overlapsSavedPlans = refs.map((r) => ({ ...r }));
      }
    }
    for (const entry of unassignedOrders) {
      if (entry.overlapsSavedPlans) continue;
      const refs = lookupRefs(entry.order.dcName, entry.order.pld);
      if (refs) {
        entry.overlapsSavedPlans = refs.map((r) => ({ ...r }));
      }
    }
  }

  return { shipments, unassignedOrders };
}
