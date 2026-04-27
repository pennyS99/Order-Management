import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";

import { readJsonFile, writeJsonFileAtomic } from "@/lib/storage/jsonFile";
import type { SavedPlan, SavedPlanMetadata } from "@/types/savedPlan";
import type { SavedPlanOverlapRef } from "@/types/planner";

const DIR_NAME = "saved-plans";
const INDEX_FILE = "_index.json";

function savedPlansDirPath(): string {
  return path.join(process.cwd(), "data", DIR_NAME);
}

function indexFilePath(): string {
  return path.join(savedPlansDirPath(), INDEX_FILE);
}

function planFilePath(id: string): string {
  return path.join(savedPlansDirPath(), `${id}.json`);
}

function normalizeNameForCompare(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeToIsoDate(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (isIsoDate(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function computePldMetaFromPlan(plan: Pick<SavedPlan, "consolidationResult">): {
  pldList: string[];
  hasUnknownPld: boolean;
} {
  const plds = new Set<string>();
  let hasUnknownPld = false;
  for (const s of plan.consolidationResult.shipments) {
    for (const o of s.orders) {
      const iso = normalizeToIsoDate(o.pld);
      if (iso) plds.add(iso);
      else hasUnknownPld = true;
    }
  }
  const pldList = Array.from(plds).sort((a, b) => a.localeCompare(b));
  return { pldList, hasUnknownPld };
}

function computeTotalOrders(plan: Pick<SavedPlan, "consolidationResult">): number {
  return plan.consolidationResult.shipments.reduce((acc, s) => acc + s.orders.length, 0);
}

function buildMetadata(
  id: string,
  name: string,
  savedAt: number,
  plan: Pick<SavedPlan, "consolidationResult">,
): SavedPlanMetadata {
  const { pldList, hasUnknownPld } = computePldMetaFromPlan(plan);
  return {
    id,
    name: name.trim(),
    savedAt,
    shipmentCount: plan.consolidationResult.shipments.length,
    unassignedCount: plan.consolidationResult.unassignedOrders.length,
    totalOrders: computeTotalOrders(plan),
    pldList,
    hasUnknownPld,
  };
}

function isSavedPlan(value: unknown): value is SavedPlan {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1) return false;
  if (typeof v.meta !== "object" || v.meta === null) return false;
  if (typeof v.consolidationResult !== "object" || v.consolidationResult === null) return false;
  if (typeof v.inputs !== "object" || v.inputs === null) return false;
  if (!Array.isArray(v.dcCoordinates)) return false;
  return true;
}

function migrateSavedPlan(plan: SavedPlan): SavedPlan {
  // v1 only; keep as hook for future migrations.
  return plan;
}

let chain: Promise<unknown> = Promise.resolve();

function runLocked<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function ensureDirExists(): Promise<void> {
  await fs.mkdir(savedPlansDirPath(), { recursive: true });
}

async function listPlanFileIds(): Promise<string[]> {
  await ensureDirExists();
  const entries = await fs.readdir(savedPlansDirPath(), { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".json") && e.name !== INDEX_FILE)
    .map((e) => e.name.replace(/\.json$/i, ""))
    .filter(Boolean);
}

async function loadMetadataFromPlanFile(id: string): Promise<SavedPlanMetadata | null> {
  const file = planFilePath(id);
  const raw = await readJsonFile<unknown>(file, null);
  if (!isSavedPlan(raw)) return null;
  const plan = migrateSavedPlan(raw);
  return plan.meta;
}

async function readIndex(): Promise<SavedPlanMetadata[]> {
  return readJsonFile<SavedPlanMetadata[]>(indexFilePath(), []);
}

async function writeIndex(plans: SavedPlanMetadata[]): Promise<void> {
  const sorted = plans
    .slice()
    .sort((a, b) => b.savedAt - a.savedAt)
    .map((p) => ({
      ...p,
      name: p.name.trim(),
      pldList: Array.from(new Set((p.pldList ?? []).filter(Boolean))).filter(isIsoDate).sort(),
      hasUnknownPld: Boolean(p.hasUnknownPld),
    }));
  await writeJsonFileAtomic(indexFilePath(), sorted);
}

async function selfHealIndexIfNeeded(currentIndex: SavedPlanMetadata[]): Promise<SavedPlanMetadata[]> {
  const fileIds = await listPlanFileIds();
  const fileIdSet = new Set(fileIds);

  const next: SavedPlanMetadata[] = [];
  const indexIdSet = new Set<string>();
  let changed = false;

  for (const meta of currentIndex) {
    if (!meta?.id || typeof meta.id !== "string") {
      changed = true;
      continue;
    }
    indexIdSet.add(meta.id);
    if (!fileIdSet.has(meta.id)) {
      changed = true;
      continue;
    }
    next.push(meta);
  }

  for (const id of fileIds) {
    if (indexIdSet.has(id)) continue;
    const meta = await loadMetadataFromPlanFile(id);
    if (meta) {
      next.push(meta);
      changed = true;
    }
  }

  if (changed) {
    await writeIndex(next);
  }
  return next.sort((a, b) => b.savedAt - a.savedAt);
}

export async function listSavedPlans(): Promise<SavedPlanMetadata[]> {
  return runLocked(async () => {
    const idx = await readIndex();
    const healed = await selfHealIndexIfNeeded(Array.isArray(idx) ? idx : []);
    return healed;
  });
}

async function loadSavedPlanUnlocked(id: string): Promise<SavedPlan | null> {
  const raw = await readJsonFile<unknown>(planFilePath(id), null);
  if (!isSavedPlan(raw)) return null;
  return migrateSavedPlan(raw);
}

export async function loadSavedPlan(id: string): Promise<SavedPlan | null> {
  return runLocked(() => loadSavedPlanUnlocked(id));
}

export type CreateSavedPlanInput = Omit<SavedPlan, "meta" | "schemaVersion"> & { name: string };

function assertValidName(name: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };
  if (trimmed.length > 80) return { ok: false, error: "Name must be 80 characters or less." };
  return { ok: true, value: trimmed };
}

function findByNameCaseInsensitive(plans: SavedPlanMetadata[], name: string): SavedPlanMetadata | null {
  const needle = normalizeNameForCompare(name);
  return plans.find((p) => normalizeNameForCompare(p.name) === needle) ?? null;
}

export async function createSavedPlan(input: CreateSavedPlanInput): Promise<
  | { ok: true; meta: SavedPlanMetadata }
  | { ok: false; status: 400 | 409; error: string; existingId?: string }
> {
  return runLocked(async () => {
    const valid = assertValidName(input.name);
    if (!valid.ok) return { ok: false as const, status: 400 as const, error: valid.error };

    if (!input?.consolidationResult?.shipments?.length) {
      return { ok: false as const, status: 400 as const, error: "No shipments to save." };
    }

    const existingIndex = await readIndex();
    const healed = await selfHealIndexIfNeeded(Array.isArray(existingIndex) ? existingIndex : []);
    const collision = findByNameCaseInsensitive(healed, valid.value);
    if (collision) {
      return {
        ok: false as const,
        status: 409 as const,
        error: "A saved plan with that name already exists.",
        existingId: collision.id,
      };
    }

    const id = `spl_${randomUUID()}`;
    const savedAt = Date.now();
    const meta = buildMetadata(id, valid.value, savedAt, { consolidationResult: input.consolidationResult });
    const plan: SavedPlan = {
      schemaVersion: 1,
      meta,
      consolidationResult: input.consolidationResult,
      inputs: input.inputs,
      dcCoordinates: input.dcCoordinates,
    };

    await writeJsonFileAtomic(planFilePath(id), plan);
    await writeIndex([meta, ...healed]);
    return { ok: true as const, meta };
  });
}

export async function replaceSavedPlan(
  id: string,
  input: CreateSavedPlanInput,
): Promise<
  | { ok: true; meta: SavedPlanMetadata }
  | { ok: false; status: 400 | 404 | 409; error: string; existingId?: string }
> {
  return runLocked(async () => {
    const valid = assertValidName(input.name);
    if (!valid.ok) return { ok: false as const, status: 400 as const, error: valid.error };

    if (!input?.consolidationResult?.shipments?.length) {
      return { ok: false as const, status: 400 as const, error: "No shipments to save." };
    }

    const current = await loadSavedPlanUnlocked(id);
    if (!current) return { ok: false as const, status: 404 as const, error: "Saved plan not found." };

    const existingIndex = await readIndex();
    const healed = await selfHealIndexIfNeeded(Array.isArray(existingIndex) ? existingIndex : []);
    const collision = findByNameCaseInsensitive(healed, valid.value);
    if (collision && collision.id !== id) {
      return {
        ok: false as const,
        status: 409 as const,
        error: "A saved plan with that name already exists.",
        existingId: collision.id,
      };
    }

    const savedAt = Date.now();
    const meta = buildMetadata(id, valid.value, savedAt, { consolidationResult: input.consolidationResult });
    const plan: SavedPlan = {
      schemaVersion: 1,
      meta,
      consolidationResult: input.consolidationResult,
      inputs: input.inputs,
      dcCoordinates: input.dcCoordinates,
    };

    await writeJsonFileAtomic(planFilePath(id), plan);
    await writeIndex([meta, ...healed.filter((p) => p.id !== id)]);
    return { ok: true as const, meta };
  });
}

export async function renameSavedPlan(
  id: string,
  name: string,
): Promise<
  | { ok: true; meta: SavedPlanMetadata }
  | { ok: false; status: 400 | 404 | 409; error: string; existingId?: string }
> {
  return runLocked(async () => {
    const valid = assertValidName(name);
    if (!valid.ok) return { ok: false as const, status: 400 as const, error: valid.error };

    const plan = await loadSavedPlanUnlocked(id);
    if (!plan) return { ok: false as const, status: 404 as const, error: "Saved plan not found." };

    const existingIndex = await readIndex();
    const healed = await selfHealIndexIfNeeded(Array.isArray(existingIndex) ? existingIndex : []);
    const collision = findByNameCaseInsensitive(healed, valid.value);
    if (collision && collision.id !== id) {
      return {
        ok: false as const,
        status: 409 as const,
        error: "A saved plan with that name already exists.",
        existingId: collision.id,
      };
    }

    const nextMeta: SavedPlanMetadata = {
      ...plan.meta,
      name: valid.value,
    };
    const nextPlan: SavedPlan = { ...plan, meta: nextMeta };

    await writeJsonFileAtomic(planFilePath(id), nextPlan);
    await writeIndex([nextMeta, ...healed.filter((p) => p.id !== id)]);
    return { ok: true as const, meta: nextMeta };
  });
}

export async function deleteSavedPlan(
  id: string,
): Promise<{ ok: true } | { ok: false; status: 404; error: string }> {
  return runLocked(async () => {
    const file = planFilePath(id);
    try {
      await fs.rm(file);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") return { ok: false as const, status: 404 as const, error: "Saved plan not found." };
      throw err;
    }

    const existingIndex = await readIndex();
    const healed = await selfHealIndexIfNeeded(Array.isArray(existingIndex) ? existingIndex : []);
    await writeIndex(healed.filter((p) => p.id !== id));
    return { ok: true as const };
  });
}

export type SavedPlansSearchFilters = {
  /** ISO YYYY-MM-DD or any parseable date string; matched by normalized ISO. */
  pld?: string;
  /** "AREA" is mapped to order province (case-insensitive contains). */
  area?: string;
  truckType?: string;
  origin?: string;
  serviceType?: string;
};

export type SavedPlansSearchResult = {
  /** Shipments with ids prefixed by plan id, unique across all plans. */
  shipments: SavedPlan["consolidationResult"]["shipments"];
  /** Combined coords from all matching plans (dcName -> lat/lng). */
  dcCoordinates: Array<{ dcName: string; lat: number; lng: number }>;
  /** Map from prefixed shipment id -> saved plan name. */
  savedPlanNameByShipmentId: Record<string, string>;
};

function includesCI(haystack: string, needle: string): boolean {
  const h = haystack.trim().toLocaleLowerCase();
  const n = needle.trim().toLocaleLowerCase();
  if (!n) return true;
  return h.includes(n);
}

function matchesPld(orders: Array<{ pld?: string }>, pldFilter: string): boolean {
  const iso = normalizeToIsoDate(pldFilter);
  if (!iso) return false;
  return orders.some((o) => normalizeToIsoDate(o.pld) === iso);
}

function matchesArea(orders: Array<{ province?: string }>, area: string): boolean {
  return orders.some((o) => includesCI(o.province ?? "", area));
}

function matchesOrigin(orders: Array<{ origin?: string }>, origin: string): boolean {
  return orders.some((o) => includesCI(o.origin ?? "", origin));
}

export async function searchSavedPlansAcrossAll(
  filters: SavedPlansSearchFilters,
): Promise<SavedPlansSearchResult> {
  return runLocked(async () => {
    const planIds = await listPlanFileIds();
    const outShipments: SavedPlan["consolidationResult"]["shipments"] = [];
    const coordByDc = new Map<string, { dcName: string; lat: number; lng: number }>();
    const nameByShipmentId: Record<string, string> = {};

    for (const planId of planIds) {
      const plan = await loadSavedPlanUnlocked(planId);
      if (!plan) continue;

      const matchesPlanLevel =
        (!filters.truckType && !filters.serviceType) || plan.consolidationResult.shipments.length > 0;

      if (!matchesPlanLevel) continue;

      for (const c of plan.dcCoordinates) {
        if (!coordByDc.has(c.dcName)) coordByDc.set(c.dcName, c);
      }

      for (const shipment of plan.consolidationResult.shipments) {
        if (filters.truckType && !includesCI(shipment.truckType ?? "", filters.truckType)) continue;
        if (filters.serviceType && !includesCI(shipment.serviceType ?? "", filters.serviceType)) continue;
        if (filters.pld && !matchesPld(shipment.orders, filters.pld)) continue;
        if (filters.area && !matchesArea(shipment.orders, filters.area)) continue;
        if (filters.origin && !matchesOrigin(shipment.orders, filters.origin)) continue;

        const prefixedId = `${plan.meta.id}::${shipment.id}`;
        outShipments.push({ ...shipment, id: prefixedId });
        nameByShipmentId[prefixedId] = plan.meta.name;
      }
    }

    return {
      shipments: outShipments,
      dcCoordinates: Array.from(coordByDc.values()),
      savedPlanNameByShipmentId: nameByShipmentId,
    };
  });
}

function normalizePo(po: string): string {
  return po.trim().toLocaleLowerCase();
}

export async function listSavedPurchaseOrders(
  options?: { excludePlanId?: string },
): Promise<Set<string>> {
  return runLocked(async () => {
    const planIds = await listPlanFileIds();
    const out = new Set<string>();
    const skipId = options?.excludePlanId;
    for (const planId of planIds) {
      if (skipId && planId === skipId) continue;
      const plan = await loadSavedPlanUnlocked(planId);
      if (!plan) continue;
      for (const shipment of plan.consolidationResult.shipments) {
        for (const line of shipment.orders) {
          const po = normalizePo(line.purchaseOrder ?? "");
          if (po) out.add(po);
        }
      }
    }
    return out;
  });
}

export interface SavedPlanPoIndexEntry {
  /** Lowercased, trimmed PO number. */
  po: string;
  planId: string;
  planName: string;
  shipmentId: string;
}

/**
 * Walk every saved plan and emit one entry per (saved-plan shipment, line) so the consolidate
 * route can both block duplicate POs and attach `overlapsSavedPlans` chip metadata to the
 * resulting unassigned record. Unlike `listFutureDcPldIndex`, this scans plans regardless of PLD
 * because today's duplicate-PO guard does not filter by date.
 */
export async function listSavedPlanPoIndex(
  options?: { excludePlanId?: string },
): Promise<SavedPlanPoIndexEntry[]> {
  return runLocked(async () => {
    const planIds = await listPlanFileIds();
    const out: SavedPlanPoIndexEntry[] = [];
    const skipId = options?.excludePlanId;
    for (const planId of planIds) {
      if (skipId && planId === skipId) continue;
      const plan = await loadSavedPlanUnlocked(planId);
      if (!plan) continue;
      const planName = plan.meta.name;
      for (const shipment of plan.consolidationResult.shipments) {
        const seenForShipment = new Set<string>();
        for (const line of shipment.orders) {
          const po = normalizePo(line.purchaseOrder ?? "");
          if (!po) continue;
          if (seenForShipment.has(po)) continue;
          seenForShipment.add(po);
          out.push({ po, planId, planName, shipmentId: shipment.id });
        }
      }
    }
    return out;
  });
}

/** Build a `Map<normalizedPo, SavedPlanOverlapRef[]>` from `listSavedPlanPoIndex` entries. */
export function buildSavedPlanPoIndexMap(
  entries: SavedPlanPoIndexEntry[],
): Map<string, SavedPlanOverlapRef[]> {
  const out = new Map<string, SavedPlanOverlapRef[]>();
  for (const entry of entries) {
    const list = out.get(entry.po);
    const ref: SavedPlanOverlapRef = {
      planId: entry.planId,
      planName: entry.planName,
      shipmentId: entry.shipmentId,
    };
    if (list) {
      if (!list.some((r) => r.planId === ref.planId && r.shipmentId === ref.shipmentId)) {
        list.push(ref);
      }
    } else {
      out.set(entry.po, [ref]);
    }
  }
  return out;
}

export interface DcPldIndexEntry {
  /** DC name as stored on the saved-plan order line. */
  dcName: string;
  /** ISO `YYYY-MM-DD`. */
  pld: string;
  planId: string;
  planName: string;
  shipmentId: string;
}

function localTodayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Walk every saved plan and emit one entry per (shipment, order) whose PLD is `today` or later.
 * Plans are skipped early when their `meta.pldList` has no future-or-today date, avoiding the
 * full per-plan read for fully-historical plans.
 */
export async function listFutureDcPldIndex(
  options?: { excludePlanId?: string; today?: string },
): Promise<DcPldIndexEntry[]> {
  return runLocked(async () => {
    const today = options?.today ?? localTodayIso();
    const skipId = options?.excludePlanId;
    const planIds = await listPlanFileIds();
    const out: DcPldIndexEntry[] = [];

    const indexCache = await readIndex();
    const metaById = new Map<string, SavedPlanMetadata>();
    if (Array.isArray(indexCache)) {
      for (const meta of indexCache) {
        if (meta?.id) metaById.set(meta.id, meta);
      }
    }

    for (const planId of planIds) {
      if (skipId && planId === skipId) continue;
      const meta = metaById.get(planId);
      if (meta) {
        const pldList = Array.isArray(meta.pldList) ? meta.pldList : [];
        const hasFuturePld = pldList.some((iso) => isIsoDate(iso) && iso >= today);
        if (!hasFuturePld) continue;
      }

      const plan = await loadSavedPlanUnlocked(planId);
      if (!plan) continue;
      const planName = plan.meta.name;

      for (const shipment of plan.consolidationResult.shipments) {
        for (const line of shipment.orders) {
          const dcName = (line.dcName ?? "").trim();
          if (!dcName) continue;
          const iso = normalizeToIsoDate(line.pld);
          if (!iso) continue;
          if (iso < today) continue;
          out.push({
            dcName,
            pld: iso,
            planId,
            planName,
            shipmentId: shipment.id,
          });
        }
      }
    }

    return out;
  });
}

export type SavedPlansFacets = {
  areas: string[];
  truckTypes: string[];
  origins: string[];
  serviceTypes: string[];
};

function normalizeFacetValue(v: string | undefined): string {
  return (v ?? "").trim();
}

export async function getSavedPlansFacets(): Promise<SavedPlansFacets> {
  return runLocked(async () => {
    const planIds = await listPlanFileIds();
    const areas = new Set<string>();
    const truckTypes = new Set<string>();
    const origins = new Set<string>();
    const serviceTypes = new Set<string>();

    for (const planId of planIds) {
      const plan = await loadSavedPlanUnlocked(planId);
      if (!plan) continue;

      for (const shipment of plan.consolidationResult.shipments) {
        const truckType = normalizeFacetValue(shipment.truckType);
        if (truckType) truckTypes.add(truckType);
        const serviceType = normalizeFacetValue(shipment.serviceType);
        if (serviceType) serviceTypes.add(serviceType);

        for (const line of shipment.orders) {
          const origin = normalizeFacetValue(line.origin);
          if (origin) origins.add(origin);
          const area = normalizeFacetValue(line.province);
          if (area) areas.add(area);
        }
      }
    }

    const sortCI = (a: string, b: string) =>
      a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

    return {
      areas: Array.from(areas).sort(sortCI),
      truckTypes: Array.from(truckTypes).sort(sortCI),
      origins: Array.from(origins).sort(sortCI),
      serviceTypes: Array.from(serviceTypes).sort(sortCI),
    };
  });
}

