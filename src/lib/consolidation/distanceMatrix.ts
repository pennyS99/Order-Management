import type { ShipmentDropStop } from "@/types/planner";
import type { PlannerRuntimeConfig } from "@/lib/consolidation/plannerRuntimeConfig";
import { DEFAULT_PLANNER_RUNTIME_CONFIG } from "@/lib/consolidation/plannerRuntimeConfig";

export type DistanceMatrixPayload = {
  drivingDistanceKm: Map<string, number>;
  drivingDurationMin: Map<string, number>;
};

export const MAX_DROPS_DEFAULT = 3;
export const MICRO_CLUSTER_THRESHOLD_KM = 0.3;
export const MAX_FIRST_TO_LAST_DROP_ROUTE_KM = 25;

export function pairKey(from: string, to: string): string {
  return `${from.trim()}::${to.trim()}`;
}

type MatrixLeg = { distance_km: number; duration_min: number };

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function loadMatrixFromCsvAtStartup(): DistanceMatrixPayload {
  if (typeof window !== "undefined") {
    return { drivingDistanceKm: new Map(), drivingDurationMin: new Map() };
  }

  // Loaded once at module init (server runtime).
  // File path: project root / driving distance matrix.csv
  // Columns: from,to,...,driving_distance_km,driving_time_m
  // Header names are not relied on (CSV contains irregular spacing).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");

  const csvPath = path.resolve(process.cwd(), "driving distance matrix.csv");
  const byName = new Map<string, MatrixLeg>();
  const distanceMap = new Map<string, number>();
  const durationMap = new Map<string, number>();

  if (!fs.existsSync(csvPath)) {
    return { drivingDistanceKm: distanceMap, drivingDurationMin: durationMap };
  }

  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/);
  for (let idx = 1; idx < lines.length; idx++) {
    const line = lines[idx]!;
    if (!line) continue;
    const cols = parseCsvLine(line);
    const from = String(cols[0] ?? "").trim();
    const to = String(cols[1] ?? "").trim();
    if (!from || !to) continue;
    const distance_km = Number(String(cols[4] ?? "").trim());
    const duration_min = Number(String(cols[5] ?? "").trim());
    if (!Number.isFinite(distance_km) || !Number.isFinite(duration_min)) continue;
    const key = pairKey(from, to);
    byName.set(key, { distance_km, duration_min });
    distanceMap.set(key, distance_km);
    durationMap.set(key, duration_min);
  }

  matrixByName = byName;
  return { drivingDistanceKm: distanceMap, drivingDurationMin: durationMap };
}

let matrixByName: Map<string, MatrixLeg> = new Map();
const MATRIX: DistanceMatrixPayload = loadMatrixFromCsvAtStartup();

export function getDistanceMatrix(): DistanceMatrixPayload {
  return MATRIX;
}

/**
 * Return directed matrix legs for the provided DC names from the process cache.
 */
export function getDistanceMatrixForDcs(dcNames: string[]): DistanceMatrixPayload {
  const drivingDistanceKm = new Map<string, number>();
  const drivingDurationMin = new Map<string, number>();
  const uniq = [...new Set(dcNames.map((d) => d.trim()).filter(Boolean))];
  for (const from of uniq) {
    for (const to of uniq) {
      const leg = matrixByName.get(pairKey(from, to));
      if (!leg) continue;
      const key = pairKey(from, to);
      drivingDistanceKm.set(key, leg.distance_km);
      drivingDurationMin.set(key, leg.duration_min);
    }
  }

  return { drivingDistanceKm, drivingDurationMin };
}

/**
 * Point lookup by DC names from the in-memory CSV matrix.
 */
export function getDistance(fromDcName: string, toDcName: string): MatrixLeg | null {
  return matrixByName.get(pairKey(fromDcName, toDcName)) ?? null;
}

/**
 * Minimum driving distance (km) between two DCs using matrix rows in either direction.
 */
export function minDirectedKm(
  from: string,
  to: string,
  matrix: Map<string, number>,
): number | undefined {
  if (from === to) return 0;
  const ab = matrix.get(pairKey(from, to));
  const ba = matrix.get(pairKey(to, from));
  if (ab !== undefined && ba !== undefined) return Math.min(ab, ba);
  return ab ?? ba;
}

/**
 * Union-find on DCs: union when driving distance is strictly less than the micro-cluster threshold.
 * Without a matrix, each DC is its own root.
 */
export function microClusterRootByDc(
  dcList: string[],
  matrix: Map<string, number> | undefined,
  microClusterThresholdKm: number = DEFAULT_PLANNER_RUNTIME_CONFIG.microClusterThresholdKm,
): Map<string, string> {
  const dcs = [...new Set(dcList.filter(Boolean))];
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let p = parent.get(x)!;
    if (p !== x) {
      p = find(p);
      parent.set(x, p);
    }
    return p;
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const d of dcs) parent.set(d, d);

  if (!matrix) {
    return new Map(dcs.map((d) => [d, d]));
  }

  for (let i = 0; i < dcs.length; i++) {
    for (let j = i + 1; j < dcs.length; j++) {
      const km = minDirectedKm(dcs[i], dcs[j], matrix);
      if (km !== undefined && km < microClusterThresholdKm) {
        union(dcs[i], dcs[j]);
      }
    }
  }

  return new Map(dcs.map((d) => [d, find(d)]));
}

/** Count of micro-cluster components among the given DCs (for drop-cap logic). */
export function microClusterComponentCount(
  drops: Set<string>,
  matrix: Map<string, number>,
  microClusterThresholdKm: number = DEFAULT_PLANNER_RUNTIME_CONFIG.microClusterThresholdKm,
): number {
  const map = microClusterRootByDc([...drops], matrix, microClusterThresholdKm);
  return new Set([...drops].map((d) => map.get(d) ?? d)).size;
}

/** Largest pairwise matrix distance inside the set (0 or 1 DC => 0). Missing matrix pairs => +Infinity. */
export function intraClusterMaxPairKm(dcs: Set<string>, matrix: Map<string, number> | undefined): number {
  if (!matrix || dcs.size <= 1) return 0;
  const list = [...dcs];
  let max = 0;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const km = minDirectedKm(list[i], list[j], matrix);
      if (km === undefined) return Number.POSITIVE_INFINITY;
      max = Math.max(max, km);
    }
  }
  return max;
}

/**
 * Minimum driving distance between any DC in `a` and any DC in `b` (includes same DC => 0).
 */
export function minInterClusterKm(
  dcsA: Iterable<string>,
  dcsB: Iterable<string>,
  matrix: Map<string, number> | undefined,
): number | undefined {
  if (!matrix) return undefined;
  const setA = new Set(dcsA);
  const setB = new Set(dcsB);
  let best: number | undefined;
  for (const x of setA) {
    for (const y of setB) {
      const km = minDirectedKm(x, y, matrix);
      if (km === undefined) continue;
      if (best === undefined || km < best) best = km;
    }
  }
  return best;
}

/** Sum of matrix legs along `order` from the first stop through the last (open tour, no return leg). */
export function orderedStopsRouteKm(order: string[], matrix: Map<string, number>): number {
  let sum = 0;
  for (let i = 1; i < order.length; i++) {
    const km = minDirectedKm(order[i - 1]!, order[i]!, matrix);
    if (km === undefined) return Number.POSITIVE_INFINITY;
    sum += km;
  }
  return sum;
}

/**
 * **First-improvement 2-opt** on an **open** tour (no return leg): reverse a segment
 * `tour[i+1..j]` whenever that strictly lowers {@link orderedStopsRouteKm}. Index `0` is never
 * moved, so a fixed first stop (e.g. narrowest register window) is preserved.
 */
export function twoOptImproveOpenTourKm(tour: string[], matrix: Map<string, number>): string[] {
  const route = tour.map((d) => d.trim()).filter(Boolean);
  if (route.length < 3) return route;

  const kmCost = (r: string[]) => orderedStopsRouteKm(r, matrix);
  if (!Number.isFinite(kmCost(route))) return route;

  let current = route;
  let improved = true;
  while (improved) {
    improved = false;
    outer: for (let i = 0; i < current.length - 2; i++) {
      for (let j = i + 2; j < current.length; j++) {
        const cand = current
          .slice(0, i + 1)
          .concat(current.slice(i + 1, j + 1).reverse(), current.slice(j + 1));
        if (kmCost(cand) + 1e-9 < kmCost(current)) {
          current = cand;
          improved = true;
          break outer;
        }
      }
    }
  }
  return current;
}

/**
 * Order DCs for display / leg km using a multi-start nearest-neighbor tour on the matrix,
 * then {@link twoOptImproveOpenTourKm}.
 */
export function orderDropsForShortestPath(drops: string[], matrix: Map<string, number> | undefined): string[] {
  const uniq = [...new Set(drops)].filter(Boolean);
  if (!matrix || uniq.length <= 1) return uniq.slice().sort();
  let bestOrder = uniq.slice().sort();
  let bestKm = Number.POSITIVE_INFINITY;
  for (const start of uniq) {
    const unvisited = new Set(uniq);
    const ordered: string[] = [];
    let current = start;
    ordered.push(current);
    unvisited.delete(current);
    while (unvisited.size > 0) {
      let next: string | undefined;
      let bestLeg = Number.POSITIVE_INFINITY;
      for (const u of unvisited) {
        const km = minDirectedKm(current, u, matrix) ?? Number.POSITIVE_INFINITY;
        if (km < bestLeg || (km === bestLeg && (next === undefined || u < next))) {
          bestLeg = km;
          next = u;
        }
      }
      if (next === undefined || bestLeg === Number.POSITIVE_INFINITY) break;
      ordered.push(next);
      unvisited.delete(next);
      current = next;
    }
    for (const u of [...unvisited].sort()) ordered.push(u);
    const tour = orderedStopsRouteKm(ordered, matrix);
    if (tour < bestKm) {
      bestKm = tour;
      bestOrder = ordered;
    }
  }
  return twoOptImproveOpenTourKm(bestOrder, matrix);
}

/**
 * Visit order that **starts** at `fixedFirst`, then nearest-neighbor by km among the remaining DCs.
 * Use when the first stop is fixed by business rules (e.g. narrowest register window).
 */
export function orderDropsNearestFromStart(
  fixedFirst: string,
  allDrops: string[],
  matrix: Map<string, number> | undefined,
): string[] {
  const uniq = [...new Set(allDrops.map((d) => d.trim()))].filter(Boolean);
  if (uniq.length <= 1) return uniq.slice().sort();
  const first = fixedFirst.trim();
  if (!uniq.includes(first)) {
    return orderDropsForShortestPath(uniq, matrix);
  }
  if (!matrix || matrix.size === 0) {
    return [first, ...uniq.filter((d) => d !== first).sort((a, b) => a.localeCompare(b))];
  }

  const ordered: string[] = [first];
  const unvisited = new Set(uniq.filter((d) => d !== first));
  let current = first;
  while (unvisited.size > 0) {
    let next: string | undefined;
    let bestLeg = Number.POSITIVE_INFINITY;
    for (const u of unvisited) {
      const km = minDirectedKm(current, u, matrix) ?? Number.POSITIVE_INFINITY;
      if (km < bestLeg || (km === bestLeg && (next === undefined || u < next))) {
        bestLeg = km;
        next = u;
      }
    }
    if (next === undefined || bestLeg === Number.POSITIVE_INFINITY) break;
    ordered.push(next);
    unvisited.delete(next);
    current = next;
  }
  for (const u of [...unvisited].sort()) ordered.push(u);
  return twoOptImproveOpenTourKm(ordered, matrix);
}

/** Driving km from first to last stop on {@link orderDropsForShortestPath} (0 if ≤1 stop). */
export function shipmentFirstToLastRouteKm(
  drops: Set<string>,
  matrix: Map<string, number> | undefined,
): number {
  if (!matrix || drops.size <= 1) return 0;
  const ordered = orderDropsForShortestPath([...drops], matrix);
  return orderedStopsRouteKm(ordered, matrix);
}

/**
 * Whether the set of DCs is allowed on one shipment using the driving matrix only:
 * effective stops = micro-cluster components (threshold from planner config).
 * and first→last route km on the shortest NN tour <= max first-to-last km.
 * Without a matrix, at most `maxDropsDefault` distinct physical DCs.
 */
export function shipmentWithinDropRules(
  drops: Set<string>,
  matrix: Map<string, number> | undefined,
  planner: PlannerRuntimeConfig = DEFAULT_PLANNER_RUNTIME_CONFIG,
): boolean {
  if (!matrix) return drops.size <= planner.maxDropsDefault;
  if (microClusterComponentCount(drops, matrix, planner.microClusterThresholdKm) > planner.maxDropsDefault) {
    return false;
  }
  return shipmentFirstToLastRouteKm(drops, matrix) <= planner.maxFirstToLastRouteKm;
}

/** Effective stop limit for multidrop (micro-cluster components must not exceed this). */
export function maxAllowedDrops(
  _drops: Set<string>,
  _matrix: Map<string, number> | undefined,
  planner: PlannerRuntimeConfig = DEFAULT_PLANNER_RUNTIME_CONFIG,
): number {
  return planner.maxDropsDefault;
}

/**
 * Build route metadata for each drop in shipment visit order (shortest NN tour on the matrix when available).
 */
export function computeDropStops(
  orderedDrops: string[],
  matrix: Map<string, number> | undefined,
  durationMatrix?: Map<string, number>,
  shipmentOrigin?: string | null,
): ShipmentDropStop[] {
  return orderedDrops.map((dcName, index) => {
    if (index === 0) {
      const origin = shipmentOrigin?.trim() ?? "";
      const km = origin && matrix ? minDirectedKm(origin, dcName, matrix) : undefined;
      const min = origin && durationMatrix ? minDirectedKm(origin, dcName, durationMatrix) : undefined;
      return {
        sequence: 1,
        dcName,
        previousDcName: origin || null,
        legFromPreviousKm: km !== undefined && Number.isFinite(km) ? km : null,
        legFromPreviousMin: min !== undefined && Number.isFinite(min) ? min : null,
        arriveMin: null,
        unloadStartMin: null,
        departMin: null,
      };
    }
    const prev = orderedDrops[index - 1];
    const km = matrix ? minDirectedKm(prev, dcName, matrix) : undefined;
    const min = durationMatrix ? minDirectedKm(prev, dcName, durationMatrix) : undefined;
    return {
      sequence: index + 1,
      dcName,
      previousDcName: prev,
      legFromPreviousKm: km !== undefined && Number.isFinite(km) ? km : null,
      legFromPreviousMin: min !== undefined && Number.isFinite(min) ? min : null,
      arriveMin: null,
      unloadStartMin: null,
      departMin: null,
    };
  });
}
