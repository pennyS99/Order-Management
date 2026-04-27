"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import {
  normalizeAddressMaster,
  normalizeTruckMaster,
  recomputeShipmentFromOrders,
  runConsolidation,
} from "@/lib/consolidation/engine";
import { parseTabularFile } from "@/lib/csv/parser";
import { buildDcPldIndex, type DcPldIndexEntry } from "@/lib/planner/savedPlanOverlap";
import type {
  ConsolidationResult,
  CsvDatasetKey,
  CsvUploadState,
  PlannerDataState,
  RawAddressMasterCsvRow,
  RawItemMasterCsvRow,
  RawOrderCsvRow,
  RawTruckMasterCsvRow,
  SavedPlanOverlapRef,
} from "@/types/planner";

interface PlannerState {
  upload: CsvUploadState;
  data: PlannerDataState;
  consolidationResult: ConsolidationResult | null;
  consolidationPlanning: boolean;
  consolidationPlanningError: string | null;
  mastersLoaded: boolean;
  mastersError?: string;
  loadedFromSavedPlan: { id: string; name: string } | null;
}

interface PlannerContextValue extends PlannerState {
  uploadCsv: (dataset: CsvDatasetKey, file: File) => Promise<void>;
  allRequiredFilesReady: boolean;
  runPlannerConsolidation: () => Promise<void>;
  reloadMasters: () => Promise<void>;
  moveDcToShipment: (
    sourceShipmentId: string,
    dcName: string,
    targetShipmentId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  hydrateFromSavedPlan: (payload: {
    id: string;
    name: string;
    data: PlannerDataState;
    consolidationResult: ConsolidationResult;
  }) => void;
  clearPlannerState: () => void;
}

type PlannerAction =
  | {
      type: "SET_UPLOAD_STATUS";
      payload: {
        dataset: CsvDatasetKey;
        status: CsvUploadState[CsvDatasetKey]["status"];
        fileName?: string;
        rowCount?: number;
        error?: string;
      };
    }
  | {
      type: "SET_DATA";
      payload: {
        dataset: CsvDatasetKey;
        rows: RawOrderCsvRow[] | RawItemMasterCsvRow[] | RawAddressMasterCsvRow[] | RawTruckMasterCsvRow[];
      };
    }
  | { type: "SET_CONSOLIDATION_RESULT"; payload: ConsolidationResult }
  | { type: "SET_CONSOLIDATION_PLANNING"; payload: { running: boolean; error?: string | null } }
  | { type: "SET_MASTERS_LOADING_STATE"; payload: { loaded: boolean; error?: string } }
  | {
      type: "HYDRATE_FROM_SAVED_PLAN";
      payload: { id: string; name: string; data: PlannerDataState; consolidationResult: ConsolidationResult };
    }
  | { type: "CLEAR_PLANNER_STATE" };

const initialUploadState: CsvUploadState = {
  orders: { fileName: "", status: "idle", rowCount: 0 },
  itemMaster: { fileName: "", status: "idle", rowCount: 0 },
  addressMaster: { fileName: "", status: "idle", rowCount: 0 },
  truckMaster: { fileName: "", status: "idle", rowCount: 0 },
};

const initialDataState: PlannerDataState = {
  rawOrders: [],
  rawItemMaster: [],
  rawAddressMaster: [],
  rawTruckMaster: [],
};

const initialState: PlannerState = {
  upload: initialUploadState,
  data: initialDataState,
  consolidationResult: null,
  consolidationPlanning: false,
  consolidationPlanningError: null,
  mastersLoaded: false,
  loadedFromSavedPlan: null,
};

const PlannerContext = createContext<PlannerContextValue | null>(null);

function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  if (action.type === "SET_UPLOAD_STATUS") {
    const { dataset, status, fileName, rowCount, error } = action.payload;
    return {
      ...state,
      upload: {
        ...state.upload,
        [dataset]: {
          ...state.upload[dataset],
          status,
          fileName: fileName ?? state.upload[dataset].fileName,
          rowCount: rowCount ?? state.upload[dataset].rowCount,
          error,
        },
      },
    };
  }

  if (action.type === "SET_DATA") {
    const datasetToField: Record<CsvDatasetKey, keyof PlannerDataState> = {
      orders: "rawOrders",
      itemMaster: "rawItemMaster",
      addressMaster: "rawAddressMaster",
      truckMaster: "rawTruckMaster",
    };
    return {
      ...state,
      data: {
        ...state.data,
        [datasetToField[action.payload.dataset]]: action.payload.rows,
      },
    };
  }

  if (action.type === "SET_CONSOLIDATION_RESULT") {
    return {
      ...state,
      consolidationResult: action.payload,
    };
  }

  if (action.type === "SET_CONSOLIDATION_PLANNING") {
    return {
      ...state,
      consolidationPlanning: action.payload.running,
      ...(action.payload.error !== undefined
        ? { consolidationPlanningError: action.payload.error }
        : {}),
    };
  }

  if (action.type === "SET_MASTERS_LOADING_STATE") {
    return {
      ...state,
      mastersLoaded: action.payload.loaded,
      mastersError: action.payload.error,
    };
  }

  if (action.type === "HYDRATE_FROM_SAVED_PLAN") {
    return {
      ...state,
      upload: {
        orders: { fileName: "Saved plan", status: "success", rowCount: action.payload.data.rawOrders.length },
        itemMaster: { fileName: "Saved plan", status: "success", rowCount: action.payload.data.rawItemMaster.length },
        addressMaster: {
          fileName: "Saved plan",
          status: "success",
          rowCount: action.payload.data.rawAddressMaster.length,
        },
        truckMaster: { fileName: "Saved plan", status: "success", rowCount: action.payload.data.rawTruckMaster.length },
      },
      data: action.payload.data,
      consolidationResult: action.payload.consolidationResult,
      consolidationPlanning: false,
      consolidationPlanningError: null,
      loadedFromSavedPlan: { id: action.payload.id, name: action.payload.name },
    };
  }

  if (action.type === "CLEAR_PLANNER_STATE") {
    return {
      ...initialState,
      mastersLoaded: state.mastersLoaded,
      mastersError: state.mastersError,
    };
  }

  return state;
}

const requiredHeaders: Record<CsvDatasetKey, string[]> = {
  orders: ["Order Date", "Purchase Order", "DC Name", "Item", "Cases"],
  itemMaster: ["ITEM", "CBM", "Weight (KG)"],
  addressMaster: ["dcName", "latitude", "longitude"],
  truckMaster: ["Truck Type", "Kg", "CBM"],
};

function hasRequiredHeaders(row: Record<string, unknown>, dataset: CsvDatasetKey): boolean {
  const keys = Object.keys(row);
  if (dataset === "addressMaster") {
    const hasDc = keys.includes("dcName") || keys.includes("DC");
    const hasLat = keys.includes("latitude") || keys.includes("Latitude");
    const hasLng = keys.includes("longitude") || keys.includes("Longitude");
    return hasDc && hasLat && hasLng;
  }
  return requiredHeaders[dataset].every((header) => keys.includes(header));
}

export function PlannerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(plannerReducer, initialState);
  const plannerDataRef = useRef(state.data);
  plannerDataRef.current = state.data;
  const loadedFromSavedPlanIdRef = useRef<string | null>(null);
  loadedFromSavedPlanIdRef.current = state.loadedFromSavedPlan?.id ?? null;

  const uploadCsv = async (dataset: CsvDatasetKey, file: File) => {
    dispatch({
      type: "SET_UPLOAD_STATUS",
      payload: { dataset, status: "parsing", fileName: file.name, rowCount: 0 },
    });

    try {
      const parsed = await parseTabularFile<Record<string, unknown>>(file);

      if (!parsed.rows.length) {
        throw new Error("No rows found in CSV file.");
      }

      if (!hasRequiredHeaders(parsed.rows[0], dataset)) {
        throw new Error(`Header mismatch. Expected: ${requiredHeaders[dataset].join(", ")}`);
      }

      dispatch({
        type: "SET_DATA",
        payload: {
          dataset,
          rows: parsed.rows as unknown as
            | RawOrderCsvRow[]
            | RawItemMasterCsvRow[]
            | RawAddressMasterCsvRow[]
            | RawTruckMasterCsvRow[],
        },
      });

      dispatch({
        type: "SET_UPLOAD_STATUS",
        payload: {
          dataset,
          status: "success",
          rowCount: parsed.rows.length,
          error: parsed.errors.length > 0 ? parsed.errors[0] : undefined,
        },
      });
    } catch (error) {
      dispatch({
        type: "SET_UPLOAD_STATUS",
        payload: {
          dataset,
          status: "error",
          rowCount: 0,
          error: error instanceof Error ? error.message : "Failed to parse CSV.",
        },
      });
    }
  };

  const allRequiredFilesReady = useMemo(
    () =>
      state.upload.orders.status === "success" &&
      state.mastersLoaded &&
      state.data.rawItemMaster.length > 0 &&
      state.data.rawAddressMaster.length > 0 &&
      state.data.rawTruckMaster.length > 0,
    [
      state.data.rawAddressMaster.length,
      state.data.rawItemMaster.length,
      state.data.rawTruckMaster.length,
      state.mastersLoaded,
      state.upload.orders.status,
    ],
  );

  const reloadMasters = useCallback(async () => {
    dispatch({ type: "SET_MASTERS_LOADING_STATE", payload: { loaded: false, error: undefined } });
    try {
      const response = await fetch("/api/masters/bootstrap");
      if (!response.ok) {
        throw new Error("Failed to load master data.");
      }
      const payload = (await response.json()) as {
        items: Array<{ item: string; cbm: number; weightKg: number }>;
        addresses: Array<{
          dcName: string;
          latitude: number;
          longitude: number;
          province: string;
          city: string;
          origin: string;
          channelType: string;
          transportMode: string;
          maxKgLtlLcl: number | null;
          leadTimeFtlFcl: number | null;
          leadTimeLtlLcl: number | null;
          registerOpen: string;
          registerClosed: string;
          unloadDurationMin: number | null;
        }>;
        trucks: Array<{ truckType: string; maxKg: number; maxCbm: number }>;
      };

      dispatch({
        type: "SET_DATA",
        payload: {
          dataset: "itemMaster",
          rows: payload.items.map((row) => ({
            ITEM: row.item,
            CBM: String(row.cbm),
            "Weight (KG)": String(row.weightKg),
          })),
        },
      });
      dispatch({
        type: "SET_DATA",
        payload: {
          dataset: "addressMaster",
          rows: payload.addresses.map((row) => ({
            dcName: row.dcName,
            latitude: String(row.latitude),
            longitude: String(row.longitude),
            Province: row.province,
            City: row.city,
            Origin: row.origin,
            "Channel Type": row.channelType,
            "Transport Mode": row.transportMode,
            "Max KG LTL/LCL": row.maxKgLtlLcl === null ? "" : String(row.maxKgLtlLcl),
            "leadtime_ftl/fcl":
              row.leadTimeFtlFcl === null || row.leadTimeFtlFcl === undefined
                ? ""
                : String(row.leadTimeFtlFcl),
            "leadtime_ltl/lcl":
              row.leadTimeLtlLcl === null || row.leadTimeLtlLcl === undefined
                ? ""
                : String(row.leadTimeLtlLcl),
            registerOpen: row.registerOpen ?? "",
            registerClosed: row.registerClosed ?? "",
            unloadDurationMin:
              row.unloadDurationMin === null || row.unloadDurationMin === undefined
                ? ""
                : String(row.unloadDurationMin),
          })),
        },
      });
      dispatch({
        type: "SET_DATA",
        payload: {
          dataset: "truckMaster",
          rows: payload.trucks.map((row) => ({
            "Truck Type": row.truckType,
            Kg: String(row.maxKg),
            CBM: String(row.maxCbm),
          })),
        },
      });
      dispatch({ type: "SET_MASTERS_LOADING_STATE", payload: { loaded: true, error: undefined } });
    } catch (error) {
      dispatch({
        type: "SET_MASTERS_LOADING_STATE",
        payload: {
          loaded: false,
          error: error instanceof Error ? error.message : "Failed to load master data",
        },
      });
    }
  }, []);

  const runPlannerConsolidation = useCallback(async () => {
    const data = plannerDataRef.current;
    const excludePlanId = loadedFromSavedPlanIdRef.current ?? undefined;
    dispatch({ type: "SET_CONSOLIDATION_PLANNING", payload: { running: true, error: null } });

    const applyApiPayload = (raw: unknown): boolean => {
      if (typeof raw !== "object" || raw === null) return false;
      const payload = raw as Record<string, unknown>;
      if (!Array.isArray(payload.shipments) || !Array.isArray(payload.unassignedOrders)) return false;
      dispatch({
        type: "SET_CONSOLIDATION_RESULT",
        payload: {
          shipments: payload.shipments as ConsolidationResult["shipments"],
          unassignedOrders: payload.unassignedOrders as ConsolidationResult["unassignedOrders"],
        },
      });
      const meta = payload.meta as Record<string, unknown> | undefined;
      const matrix = meta?.matrix as Record<string, unknown> | undefined;
      if (matrix && typeof matrix.loaded === "boolean") {
        console.info(
          `[planner] matrix loaded=${matrix.loaded}, distancePairs=${matrix.distancePairs}, durationPairs=${matrix.durationPairs}, missingDurationPairs=${matrix.missingDurationPairs}`,
        );
      }
      return true;
    };

    const runClientFallback = async (label: string) => {
      try {
        const qs = excludePlanId
          ? `?excludePlanId=${encodeURIComponent(excludePlanId)}`
          : "";
        let savedPlanPoIndex: Map<string, SavedPlanOverlapRef[]> | undefined;
        let blockedPurchaseOrders: Set<string> | undefined;
        let savedPlanDcPldIndex: Map<string, SavedPlanOverlapRef[]> | undefined;

        try {
          const [poRes, dcPldRes] = await Promise.all([
            fetch(`/api/planner/saved-plans/po-index${qs}`, { method: "GET" }),
            fetch(`/api/planner/saved-plans/dc-pld-index${qs}`, { method: "GET" }),
          ]);

          if (poRes.ok) {
            const payload = (await poRes.json()) as {
              purchaseOrders?: string[];
              entries?: Array<{ po: string; planId: string; planName: string; shipmentId: string }>;
            };
            if (Array.isArray(payload.entries) && payload.entries.length > 0) {
              const map = new Map<string, SavedPlanOverlapRef[]>();
              for (const e of payload.entries) {
                const key = String(e.po ?? "").trim().toLocaleLowerCase();
                if (!key) continue;
                const list = map.get(key);
                const ref: SavedPlanOverlapRef = {
                  planId: e.planId,
                  planName: e.planName,
                  shipmentId: e.shipmentId,
                };
                if (list) {
                  if (!list.some((r) => r.planId === ref.planId && r.shipmentId === ref.shipmentId)) {
                    list.push(ref);
                  }
                } else {
                  map.set(key, [ref]);
                }
              }
              savedPlanPoIndex = map;
            } else if (Array.isArray(payload.purchaseOrders)) {
              blockedPurchaseOrders = new Set(
                payload.purchaseOrders.map((p) => String(p).trim().toLocaleLowerCase()).filter(Boolean),
              );
            }
          }

          if (dcPldRes.ok) {
            const payload = (await dcPldRes.json()) as { entries?: DcPldIndexEntry[] };
            if (Array.isArray(payload.entries)) {
              savedPlanDcPldIndex = buildDcPldIndex(payload.entries);
            }
          }
        } catch {
          // Ignore and continue without saved-plan awareness in fallback.
        }

        const result = runConsolidation(data, {
          blockedPurchaseOrders,
          savedPlanPoIndex,
          savedPlanDcPldIndex,
        });
        dispatch({ type: "SET_CONSOLIDATION_RESULT", payload: result });
        dispatch({ type: "SET_CONSOLIDATION_PLANNING", payload: { running: false, error: null } });
      } catch (err) {
        console.error(`[planner] ${label}`, err);
        dispatch({
          type: "SET_CONSOLIDATION_PLANNING",
          payload: {
            running: false,
            error: err instanceof Error ? err.message : "Client consolidation failed",
          },
        });
      }
    };

    const controller = new AbortController();
    const timeoutMs = 240_000;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body = excludePlanId ? { ...data, excludePlanId } : data;
      const response = await fetch("/api/planner/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.ok) {
        let raw: unknown;
        try {
          raw = await response.json();
        } catch (e) {
          console.error("[planner] invalid JSON from consolidate API", e);
          void runClientFallback("client fallback after bad JSON");
          return;
        }
        if (applyApiPayload(raw)) {
          dispatch({ type: "SET_CONSOLIDATION_PLANNING", payload: { running: false, error: null } });
          return;
        }
      }

      void runClientFallback("client fallback (API not OK or unexpected shape)");
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (aborted) {
        console.warn(`[planner] consolidate request aborted after ${timeoutMs}ms, using client engine`);
      } else {
        console.error("[planner] consolidate request failed", err);
      }
      void runClientFallback("client fallback after fetch error");
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  const loadDistanceMatrixForDcs = useCallback(async (dcNames: string[]) => {
    const response = await fetch("/api/planner/matrix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dcNames }),
    });
    if (!response.ok) {
      throw new Error("Failed to load driving matrix.");
    }
    const payload = (await response.json()) as {
      distanceEntries?: Array<[string, number]>;
      durationEntries?: Array<[string, number]>;
    };
    return {
      drivingDistanceKm: new Map<string, number>(payload.distanceEntries ?? []),
      drivingDurationMin: new Map<string, number>(payload.durationEntries ?? []),
    };
  }, []);

  const moveDcToShipment = useCallback(
    async (sourceShipmentId: string, dcName: string, targetShipmentId: string) => {
      const current = state.consolidationResult;
      if (!current) {
        return { ok: false as const, error: "No plan loaded." };
      }
      if (sourceShipmentId === targetShipmentId) {
        return { ok: false as const, error: "Pick another shipment." };
      }

      const sourceShipment = current.shipments.find((shipment) => shipment.id === sourceShipmentId);
      const targetShipment = current.shipments.find((shipment) => shipment.id === targetShipmentId);
      if (!sourceShipment || !targetShipment) {
        return { ok: false as const, error: "Shipment not found." };
      }

      const movingOrders = sourceShipment.orders.filter((line) => line.dcName === dcName);
      if (movingOrders.length === 0) {
        return { ok: false as const, error: "Nothing to move for that DC." };
      }

      const sourceRemainingOrders = sourceShipment.orders.filter((line) => line.dcName !== dcName);
      const targetNextOrders = [...targetShipment.orders, ...movingOrders];
      const trucks = normalizeTruckMaster(state.data.rawTruckMaster);
      const addressByDc = new Map(
        normalizeAddressMaster(state.data.rawAddressMaster).map((row) => [row.dcName, row]),
      );
      if (trucks.length === 0) {
        return { ok: false as const, error: "Truck master missing." };
      }

      const affectedDcNames = Array.from(
        new Set(
          [...sourceRemainingOrders, ...targetNextOrders]
            .map((line) => line.dcName?.trim())
            .filter((name): name is string => Boolean(name)),
        ),
      );

      let drivingDistanceKm: Map<string, number> | undefined;
      let drivingDurationMin: Map<string, number> | undefined;
      try {
        const matrix = await loadDistanceMatrixForDcs(affectedDcNames);
        drivingDistanceKm = matrix.drivingDistanceKm;
        drivingDurationMin = matrix.drivingDurationMin;
      } catch (error) {
        console.warn("[planner] moveDcToShipment matrix load failed; continuing without matrix", error);
      }

      const sourceRecomputed = recomputeShipmentFromOrders(
        sourceShipment.id,
        sourceRemainingOrders,
        trucks,
        drivingDistanceKm,
        addressByDc,
        drivingDurationMin,
      );
      if (sourceRecomputed.error) {
        return { ok: false as const, error: sourceRecomputed.error };
      }

      const targetRecomputed = recomputeShipmentFromOrders(
        targetShipment.id,
        targetNextOrders,
        trucks,
        drivingDistanceKm,
        addressByDc,
        drivingDurationMin,
      );
      if (targetRecomputed.error) {
        return { ok: false as const, error: targetRecomputed.error };
      }

      const nextShipments = current.shipments.flatMap((shipment) => {
        if (shipment.id === sourceShipment.id) {
          return sourceRecomputed.shipment ? [sourceRecomputed.shipment] : [];
        }
        if (shipment.id === targetShipment.id) {
          return targetRecomputed.shipment ? [targetRecomputed.shipment] : [];
        }
        return [shipment];
      });

      dispatch({
        type: "SET_CONSOLIDATION_RESULT",
        payload: {
          ...current,
          shipments: nextShipments,
        },
      });

      return { ok: true as const };
    },
    [
      state.consolidationResult,
      state.data.rawTruckMaster,
      state.data.rawAddressMaster,
      loadDistanceMatrixForDcs,
    ],
  );

  useEffect(() => {
    void reloadMasters();
  }, [reloadMasters]);

  return (
    <PlannerContext.Provider
      value={{
        ...state,
        uploadCsv,
        allRequiredFilesReady,
        runPlannerConsolidation,
        reloadMasters,
        moveDcToShipment,
        hydrateFromSavedPlan: (payload) => dispatch({ type: "HYDRATE_FROM_SAVED_PLAN", payload }),
        clearPlannerState: () => dispatch({ type: "CLEAR_PLANNER_STATE" }),
      }}
    >
      {children}
    </PlannerContext.Provider>
  );
}

export function usePlannerContext() {
  const context = useContext(PlannerContext);
  if (!context) {
    throw new Error("usePlannerContext must be used within PlannerProvider.");
  }
  return context;
}
