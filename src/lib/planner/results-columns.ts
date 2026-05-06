export type PlannerResultsTab = "dc" | "po" | "unassigned";

export type PlannerColumnConfig = {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
};

export type PlannerResultsColumnsStateV1 = {
  version: 1;
  columnsByTab: Record<PlannerResultsTab, PlannerColumnConfig[]>;
};

export const PLANNER_RESULTS_COLUMNS_STORAGE_KEY = "planner-results-columns:v1";

export function defaultColumnsByTab(): PlannerResultsColumnsStateV1["columnsByTab"] {
  return {
    dc: [
      { id: "no", label: "No.", enabled: true, order: 0 },
      { id: "shipmentId", label: "Shipment", enabled: true, order: 1 },
      { id: "dcName", label: "DC Name", enabled: true, order: 2 },
      { id: "dropSequence", label: "Drop #", enabled: true, order: 3 },
      { id: "startPicking", label: "Pick time", enabled: true, order: 4 },
      { id: "plt", label: "Ready time", enabled: true, order: 5 },
      { id: "legKm", label: "Drive km", enabled: true, order: 6 },
      { id: "legMin", label: "Drive min", enabled: true, order: 7 },
      { id: "arrive", label: "Arrive", enabled: true, order: 8 },
      { id: "unloadStart", label: "Unload start", enabled: true, order: 9 },
      { id: "depart", label: "Depart", enabled: true, order: 10 },
      { id: "tripDur", label: "Trip dur", enabled: true, order: 11 },
      { id: "totalQty", label: "Qty", enabled: true, order: 12 },
      { id: "totalKg", label: "KG", enabled: true, order: 13 },
      { id: "totalCbm", label: "Volume", enabled: true, order: 14 },
      { id: "utilizationPct", label: "Util %", enabled: true, order: 15 },
      { id: "truckType", label: "Truck type", enabled: true, order: 16 },
      { id: "serviceType", label: "Service", enabled: true, order: 17 },
      { id: "pld", label: "PLD", enabled: true, order: 18 },
      { id: "rad", label: "RAD", enabled: true, order: 19 },
    ],
    po: [
      { id: "no", label: "No.", enabled: true, order: 0 },
      { id: "shipmentId", label: "Shipment", enabled: true, order: 1 },
      { id: "dcName", label: "DC Name", enabled: true, order: 2 },
      { id: "poNumber", label: "PO Number", enabled: true, order: 3 },
      { id: "dropSequence", label: "Drop #", enabled: true, order: 4 },
      { id: "startPicking", label: "Pick time", enabled: true, order: 5 },
      { id: "plt", label: "Ready time", enabled: true, order: 6 },
      { id: "totalQty", label: "Qty", enabled: true, order: 7 },
      { id: "totalKg", label: "KG", enabled: true, order: 8 },
      { id: "totalCbm", label: "Volume", enabled: true, order: 9 },
      { id: "utilizationPct", label: "Util %", enabled: true, order: 10 },
      { id: "truckType", label: "Truck type", enabled: true, order: 11 },
      { id: "serviceType", label: "Service", enabled: true, order: 12 },
      { id: "tripDur", label: "Trip dur", enabled: true, order: 13 },
      { id: "pld", label: "PLD", enabled: true, order: 14 },
      { id: "rad", label: "RAD", enabled: true, order: 15 },
      { id: "poExpiredDate", label: "PO Exp", enabled: true, order: 16 },
    ],
    unassigned: [
      { id: "no", label: "No.", enabled: true, order: 0 },
      { id: "shipmentId", label: "Shipment", enabled: true, order: 1 },
      { id: "dcName", label: "DC Name", enabled: true, order: 2 },
      { id: "dropSequence", label: "Drop #", enabled: true, order: 3 },
      { id: "startPicking", label: "Pick time", enabled: true, order: 4 },
      { id: "plt", label: "Ready time", enabled: true, order: 5 },
    ],
  };
}

export function normalizeOrder(columns: PlannerColumnConfig[]): PlannerColumnConfig[] {
  return columns
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c, index) => ({ ...c, order: index }));
}

export function mergeStoredWithDefaults(args: {
  defaults: PlannerColumnConfig[];
  stored: unknown;
}): PlannerColumnConfig[] {
  const { defaults, stored } = args;
  if (!Array.isArray(stored)) return normalizeOrder(defaults);

  const byIdDefault = new Map(defaults.map((c) => [c.id, c] as const));
  const storedArr = stored as Array<Partial<PlannerColumnConfig> & { id?: unknown }>;

  const merged: PlannerColumnConfig[] = [];
  for (const item of storedArr) {
    const id = typeof item?.id === "string" ? item.id : "";
    const base = byIdDefault.get(id);
    if (!base) continue;
    merged.push({
      ...base,
      label: typeof item.label === "string" ? item.label : base.label,
      enabled: typeof item.enabled === "boolean" ? item.enabled : base.enabled,
      order: typeof item.order === "number" && Number.isFinite(item.order) ? item.order : base.order,
    });
  }

  const mergedIds = new Set(merged.map((c) => c.id));
  for (const d of defaults) {
    if (!mergedIds.has(d.id)) merged.push(d);
  }

  return normalizeOrder(merged);
}

export function buildStateFromStorage(raw: unknown): PlannerResultsColumnsStateV1 {
  const defaultsByTab = defaultColumnsByTab();
  const normalizedDefaults: PlannerResultsColumnsStateV1["columnsByTab"] = {
    dc: normalizeOrder(defaultsByTab.dc),
    po: normalizeOrder(defaultsByTab.po),
    unassigned: normalizeOrder(defaultsByTab.unassigned),
  };

  const base: PlannerResultsColumnsStateV1 = { version: 1, columnsByTab: normalizedDefaults };

  if (!raw || typeof raw !== "object") return base;

  const parsed = raw as Partial<PlannerResultsColumnsStateV1>;
  if (parsed.version !== 1 || !parsed.columnsByTab) return base;

  const ensureNonEmpty = (tab: PlannerResultsTab, columns: PlannerColumnConfig[]): PlannerColumnConfig[] => {
    const hasEnabled = columns.some((c) => c.enabled);
    return hasEnabled ? columns : normalizedDefaults[tab];
  };

  return {
    version: 1,
    columnsByTab: {
      dc: ensureNonEmpty(
        "dc",
        mergeStoredWithDefaults({ defaults: normalizedDefaults.dc, stored: parsed.columnsByTab.dc }),
      ),
      po: ensureNonEmpty(
        "po",
        mergeStoredWithDefaults({ defaults: normalizedDefaults.po, stored: parsed.columnsByTab.po }),
      ),
      unassigned: ensureNonEmpty(
        "unassigned",
        mergeStoredWithDefaults({
          defaults: normalizedDefaults.unassigned,
          stored: parsed.columnsByTab.unassigned,
        }),
      ),
    },
  };
}

