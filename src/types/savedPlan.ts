import type {
  ConsolidationResult,
  RawAddressMasterCsvRow,
  RawItemMasterCsvRow,
  RawOrderCsvRow,
  RawTruckMasterCsvRow,
} from "@/types/planner";

export interface SavedPlanMetadata {
  id: string;
  name: string;
  savedAt: number;
  shipmentCount: number;
  unassignedCount: number;
  totalOrders: number;
  /** ISO date strings "YYYY-MM-DD", sorted ascending, deduped. */
  pldList: string[];
  hasUnknownPld: boolean;
}

export interface SavedPlan {
  meta: SavedPlanMetadata;
  consolidationResult: ConsolidationResult;
  inputs: {
    rawOrders: RawOrderCsvRow[];
    rawItemMaster: RawItemMasterCsvRow[];
    rawAddressMaster: RawAddressMasterCsvRow[];
    rawTruckMaster: RawTruckMasterCsvRow[];
  };
  dcCoordinates: Array<{ dcName: string; lat: number; lng: number }>;
  schemaVersion: 1;
}

