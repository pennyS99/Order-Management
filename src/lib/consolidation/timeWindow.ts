import type { AddressRecord } from "@/types/planner";
import { orderedStopsRouteKm } from "@/lib/consolidation/distanceMatrix";
import type { PlannerRuntimeConfig } from "@/lib/consolidation/plannerRuntimeConfig";
import { DEFAULT_PLANNER_RUNTIME_CONFIG } from "@/lib/consolidation/plannerRuntimeConfig";

function pairKey(from: string, to: string): string {
  return `${from.trim()}::${to.trim()}`;
}

/** If `t` falls inside the global lunch window, advance to lunch end. */
export function skipPastGlobalLunch(t: number, planner: PlannerRuntimeConfig): number {
  if (t >= planner.globalLunchStartMin && t < planner.globalLunchEndMin) {
    return planner.globalLunchEndMin;
  }
  return t;
}

/**
 * Add unloading minutes to `startMin`, pausing for the global lunch window (no work during lunch).
 */
export function addUnloadMinutesRespectingGlobalLunch(
  startMin: number,
  unloadMin: number,
  planner: PlannerRuntimeConfig,
): number {
  let t = skipPastGlobalLunch(startMin, planner);
  let remaining = unloadMin;
  const eps = 1e-6;
  while (remaining > eps) {
    if (t < planner.globalLunchStartMin) {
      const roomToLunch = planner.globalLunchStartMin - t;
      if (remaining <= roomToLunch + eps) {
        t += remaining;
        remaining = 0;
      } else {
        remaining -= roomToLunch;
        t = planner.globalLunchEndMin;
      }
    } else if (t >= planner.globalLunchEndMin) {
      t += remaining;
      remaining = 0;
    } else {
      t = planner.globalLunchEndMin;
    }
  }
  return skipPastGlobalLunch(t, planner);
}

/** Parse "HH:mm" or "H:mm" to minutes from midnight; null if invalid. */
export function parseHHmmToMinutes(text: string): number | null {
  const s = text.trim();
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min < 0 || min > 59 || h < 0 || h > 47) return null;
  return h * 60 + min;
}

/**
 * Driving duration (minutes) along the route from `from` to `to`.
 * Uses the **forward** matrix row only when present (real OD time); falls back to the reverse row
 * if the forward leg is missing. Never uses `min(forward, reverse)` — that underestimates true
 * drive time and can mark sequences feasible when the truck would arrive after register closed.
 */
export function routeLegDurationMin(
  from: string,
  to: string,
  matrix: Map<string, number>,
): number | undefined {
  const a = from.trim();
  const b = to.trim();
  if (a === b) return 0;
  const forward = matrix.get(pairKey(a, b));
  if (forward !== undefined && Number.isFinite(forward)) return forward;
  const backward = matrix.get(pairKey(b, a));
  if (backward !== undefined && Number.isFinite(backward)) return backward;
  return undefined;
}

/** @deprecated Use {@link routeLegDurationMin} for time simulation (was incorrectly symmetric-min). */
export function minDirectedMin(
  from: string,
  to: string,
  matrix: Map<string, number>,
): number | undefined {
  return routeLegDurationMin(from, to, matrix);
}

/** Directed route leg duration (see {@link routeLegDurationMin}). */
export const directedDurationMin = routeLegDurationMin;

export type TimeStopSim = {
  dcName: string;
  legFromPreviousMin: number | null;
  arriveMin: number;
  unloadStartMin: number;
  departMin: number;
};

export type EvaluateSequenceResult = {
  feasible: boolean;
  /** depart[last] - actualArrive[first] */
  totalTripMin: number;
  perStop: TimeStopSim[];
};

function addressTimeFieldsReady(addr: AddressRecord | undefined): boolean {
  if (!addr) return false;
  const open = parseHHmmToMinutes(addr.registerOpen);
  const closed = parseHHmmToMinutes(addr.registerClosed);
  const unload = addr.unloadDurationMin;
  if (open === null || closed === null) return false;
  if (unload === null || !Number.isFinite(unload) || unload < 0) return false;
  if (closed < open) return false;
  return true;
}

/**
 * DC with the narrowest register window (registerClosed − registerOpen), in minutes.
 * Tie: lexicographically smaller `dcName` wins so the choice is stable.
 * Returns null if any DC in the set lacks valid register/unload fields.
 */
export function dcWithShortestRegisterWindow(
  dcs: string[],
  addressByDc: Map<string, AddressRecord>,
): string | null {
  const uniq = [...new Set(dcs.map((d) => d.trim()))].filter(Boolean);
  if (uniq.length === 0) return null;
  let best: string | null = null;
  let bestWindow = Number.POSITIVE_INFINITY;
  for (const dc of uniq) {
    const addr = addressByDc.get(dc);
    if (!addressTimeFieldsReady(addr)) return null;
    const open = parseHHmmToMinutes(addr!.registerOpen)!;
    const closed = parseHHmmToMinutes(addr!.registerClosed)!;
    const windowMin = closed - open;
    if (
      best === null ||
      windowMin < bestWindow ||
      (windowMin === bestWindow && dc.localeCompare(best!) < 0)
    ) {
      bestWindow = windowMin;
      best = dc;
    }
  }
  return best;
}

/**
 * Forward-simulate one drop order. First stop is always `seq[0]` and arrives at that DC's registerOpen.
 * Later stops: actual gate arrival must be <= registerClosed − arrival buffer (road buffer).
 */
export function evaluateSequenceTime(
  sequence: string[],
  addressByDc: Map<string, AddressRecord>,
  durationMatrix: Map<string, number>,
  planner: PlannerRuntimeConfig = DEFAULT_PLANNER_RUNTIME_CONFIG,
): EvaluateSequenceResult {
  const perStop: TimeStopSim[] = [];
  const seq = sequence.map((d) => d.trim()).filter(Boolean);
  if (seq.length === 0) {
    return { feasible: false, totalTripMin: Number.POSITIVE_INFINITY, perStop: [] };
  }

  for (const dc of seq) {
    if (!addressTimeFieldsReady(addressByDc.get(dc))) {
      return { feasible: false, totalTripMin: Number.POSITIVE_INFINITY, perStop: [] };
    }
  }

  const dc0 = seq[0]!;
  const addr0 = addressByDc.get(dc0)!;
  const open0 = parseHHmmToMinutes(addr0.registerOpen)!;
  const closed0 = parseHHmmToMinutes(addr0.registerClosed)!;
  const unload0 = addr0.unloadDurationMin!;

  const rawArrive0 = open0;
  const startUnload0 = skipPastGlobalLunch(Math.max(rawArrive0, open0), planner);
  const depart0 = addUnloadMinutesRespectingGlobalLunch(startUnload0, unload0, planner);
  perStop.push({
    dcName: dc0,
    legFromPreviousMin: null,
    arriveMin: rawArrive0,
    unloadStartMin: startUnload0,
    departMin: depart0,
  });

  let prev = dc0;
  let prevDepart = depart0;

  for (let i = 1; i < seq.length; i++) {
    const dc = seq[i]!;
    const addr = addressByDc.get(dc)!;
    const open = parseHHmmToMinutes(addr.registerOpen)!;
    const closed = parseHHmmToMinutes(addr.registerClosed)!;
    const unload = addr.unloadDurationMin!;

    const leg = directedDurationMin(prev, dc, durationMatrix);
    if (leg === undefined || !Number.isFinite(leg)) {
      return { feasible: false, totalTripMin: Number.POSITIVE_INFINITY, perStop: [] };
    }

    const rawArrive = prevDepart + leg;
    const latestArrive = closed - planner.arrivalBufferBeforeCloseMin;
    if (rawArrive - latestArrive > 1e-3) {
      return { feasible: false, totalTripMin: Number.POSITIVE_INFINITY, perStop: [] };
    }

    const startUnload = skipPastGlobalLunch(Math.max(rawArrive, open), planner);
    const depart = addUnloadMinutesRespectingGlobalLunch(startUnload, unload, planner);
    perStop.push({
      dcName: dc,
      legFromPreviousMin: leg,
      arriveMin: rawArrive,
      unloadStartMin: startUnload,
      departMin: depart,
    });
    prev = dc;
    prevDepart = depart;
  }

  const firstArrive = perStop[0]!.arriveMin;
  const lastDepart = perStop[perStop.length - 1]!.departMin;
  const totalTripMin = lastDepart - firstArrive;
  return { feasible: true, totalTripMin, perStop };
}

export type BestSequenceResult = {
  sequence: string[];
  perStop: TimeStopSim[];
  tripDurationMin: number;
};

/**
 * After a time-feasible sequence is chosen, apply **2-opt by km** (open tour): accept a reversal
 * only if {@link evaluateSequenceTime} stays feasible and total {@link orderedStopsRouteKm} drops.
 */
export function improveFeasibleSequenceByKmTwoOpt(
  sequence: string[],
  addressByDc: Map<string, AddressRecord>,
  durationMatrix: Map<string, number>,
  distanceMatrix: Map<string, number>,
  planner: PlannerRuntimeConfig = DEFAULT_PLANNER_RUNTIME_CONFIG,
): BestSequenceResult | null {
  const route = sequence.map((d) => d.trim()).filter(Boolean);
  const ev0 = evaluateSequenceTime(route, addressByDc, durationMatrix, planner);
  if (!ev0.feasible) return null;
  if (route.length < 3) {
    return { sequence: route, perStop: ev0.perStop, tripDurationMin: ev0.totalTripMin };
  }

  let current = route;
  let bestKm = orderedStopsRouteKm(current, distanceMatrix);
  if (!Number.isFinite(bestKm)) {
    return { sequence: current, perStop: ev0.perStop, tripDurationMin: ev0.totalTripMin };
  }

  let improved = true;
  while (improved) {
    improved = false;
    outer: for (let i = 0; i < current.length - 2; i++) {
      for (let j = i + 2; j < current.length; j++) {
        const cand = current
          .slice(0, i + 1)
          .concat(current.slice(i + 1, j + 1).reverse(), current.slice(j + 1));
        const ck = orderedStopsRouteKm(cand, distanceMatrix);
        if (!Number.isFinite(ck) || ck + 1e-9 >= bestKm) continue;
        const ev = evaluateSequenceTime(cand, addressByDc, durationMatrix, planner);
        if (!ev.feasible) continue;
        current = cand;
        bestKm = ck;
        improved = true;
        break outer;
      }
    }
  }

  const evFinal = evaluateSequenceTime(current, addressByDc, durationMatrix, planner);
  if (!evFinal.feasible) return null;
  return {
    sequence: current,
    perStop: evFinal.perStop,
    tripDurationMin: evFinal.totalTripMin,
  };
}

function permutationsUnique<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  const used = new Array(items.length).fill(false);
  const cur: T[] = [];

  function dfs() {
    if (cur.length === items.length) {
      out.push(cur.slice());
      return;
    }
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(items[i]!);
      dfs();
      cur.pop();
      used[i] = false;
    }
  }
  dfs();
  return out;
}

/**
 * Among sequences whose **first** stop is the DC with the shortest register window, permutes the
 * remaining DCs and picks a feasible sequence minimizing total trip time.
 */
export function bestFeasibleSequence(
  drops: string[],
  addressByDc: Map<string, AddressRecord>,
  durationMatrix: Map<string, number> | undefined,
  planner: PlannerRuntimeConfig = DEFAULT_PLANNER_RUNTIME_CONFIG,
): BestSequenceResult | null {
  if (!durationMatrix || durationMatrix.size === 0) return null;
  const uniq = [...new Set(drops.map((d) => d.trim()))].filter(Boolean);
  if (uniq.length === 0) return null;
  if (uniq.length > planner.maxDropsDefault) return null;

  const firstFixed = dcWithShortestRegisterWindow(uniq, addressByDc);
  if (firstFixed === null) return null;

  const others = uniq.filter((d) => d !== firstFixed);
  const candidatePerms: string[][] =
    others.length === 0
      ? [[firstFixed]]
      : permutationsUnique(others).map((tail) => [firstFixed, ...tail]);

  let best: BestSequenceResult | null = null;
  let bestTrip = Number.POSITIVE_INFINITY;

  for (const perm of candidatePerms) {
    const ev = evaluateSequenceTime(perm, addressByDc, durationMatrix, planner);
    if (!ev.feasible) continue;
    if (ev.totalTripMin < bestTrip) {
      bestTrip = ev.totalTripMin;
      best = {
        sequence: perm,
        perStop: ev.perStop,
        tripDurationMin: ev.totalTripMin,
      };
    }
  }

  return best;
}

export function shipmentTimeFeasible(
  drops: Set<string>,
  addressByDc: Map<string, AddressRecord>,
  durationMatrix: Map<string, number> | undefined,
  planner: PlannerRuntimeConfig = DEFAULT_PLANNER_RUNTIME_CONFIG,
): boolean {
  if (drops.size <= 1) return true;
  if (!durationMatrix || durationMatrix.size === 0) return true;
  return bestFeasibleSequence([...drops], addressByDc, durationMatrix, planner) !== null;
}
