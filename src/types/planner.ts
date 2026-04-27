export type CsvDatasetKey = "orders" | "itemMaster" | "addressMaster" | "truckMaster";

export interface CsvUploadFileState {
  fileName: string;
  status: "idle" | "parsing" | "success" | "error";
  error?: string;
  rowCount: number;
}

export type CsvUploadState = Record<CsvDatasetKey, CsvUploadFileState>;

export interface RawOrderCsvRow {
  "Order Date": string;
  /** PO expiry date from uploaded order file when present (column header: "Expired PO"). */
  "Expired PO"?: string;
  "Purchase Order": string;
  "DC Name": string;
  PLD?: string;
  "Plan Loading Date"?: string;
  Address?: string;
  Origin?: string;
  Item: string;
  /** Item description (e.g. Excel column J header "Desc") */
  Desc?: string;
  Cases: string;
}

export interface RawItemMasterCsvRow {
  ITEM: string;
  CBM: string;
  "Weight (KG)": string;
}

export interface RawAddressMasterCsvRow {
  DC?: string;
  dcName?: string;
  Latitude?: string;
  latitude?: string;
  Longitude?: string;
  longitude?: string;
  Origin?: string;
  "Channel Type"?: string;
  transportmode?: string;
  "Transport Mode"?: string;
  "Max KG LTL/LCL"?: string;
  "Max KG LTL LCL"?: string;
  " Max KG LTL/LCL "?: string;
  Province?: string;
  province?: string;
  City?: string;
  city?: string;
  /** DC register (gate-in) open time, "HH:mm" 24h — from masters / CSV when present */
  registerOpen?: string;
  /** DC register close time, "HH:mm" 24h — arrival must be within [open, closed] */
  registerClosed?: string;
  /** Expected unloading duration at DC in minutes */
  unloadDurationMin?: number | string | null;
  leadtime_ftl_fcl?: number | string | null;
  "leadtime_ftl/fcl"?: number | string | null;
  leadtime_ltl_lcl?: number | string | null;
  "leadtime_ltl/lcl"?: number | string | null;
}

export interface RawTruckMasterCsvRow {
  "Truck Type": string;
  Kg: string;
  CBM: string;
}

export interface OrderLine {
  orderDate: string;
  /** PO expiry date from uploaded order file when present. */
  poExpiredDate?: string;
  purchaseOrder: string;
  dcName: string;
  /** Plan Loading Date from uploaded order file when present. */
  pld?: string;
  address?: string;
  /** From order file column "Origin" when present */
  origin?: string;
  item: string;
  /** From order file column "Desc" when present */
  itemDescription?: string;
  cases: number;
}

export interface ItemMasterRecord {
  item: string;
  cbm: number;
  weightKg: number;
}

export interface AddressRecord {
  dcName: string;
  latitude: number;
  longitude: number;
  origin: string;
  channelType: string;
  transportMode: string;
  maxKgLtlLcl: number | null;
  /** From address master when present */
  province: string;
  /** "HH:mm" 24h; empty if unknown */
  registerOpen: string;
  /** "HH:mm" 24h; empty if unknown */
  registerClosed: string;
  /** Minutes; null if unknown */
  unloadDurationMin: number | null;
  /** Days; null if unknown */
  leadTimeFtlFcl: number | null;
  /** Days; null if unknown */
  leadTimeLtlLcl: number | null;
}

export interface TruckType {
  truckType: string;
  maxKg: number;
  maxCbm: number;
}

export type ServiceType = "FTL" | "LTL" | "FCL" | "LCL";

export interface EnrichedOrderLine extends OrderLine {
  totalCbm: number;
  totalWeightKg: number;
  /** From address master for this DC when known */
  province?: string;
}

export interface ShipmentOrderLine extends EnrichedOrderLine {
  dropSequence: number;
  /** Required arrival date from PLD + lead time (derived). */
  rad?: string;
}

/** One stop in the shipment drop route (order matches consolidation sequence). */
export interface ShipmentDropStop {
  sequence: number;
  dcName: string;
  /** Prior stop in route; for first drop this may be the shipment origin when known. */
  previousDcName: string | null;
  /** Driving km from previous stop (or origin for first drop); null if unknown in matrix. */
  legFromPreviousKm: number | null;
  /** Driving minutes from previous stop (or origin for first drop); null if unknown. */
  legFromPreviousMin: number | null;
  /**
   * Simulated clock time at gate arrival (minutes from midnight, may exceed 1439 on long routes).
   * Null when time matrix / windows were not used.
   */
  arriveMin: number | null;
  /** When unloading starts (after any wait until registerOpen). */
  unloadStartMin: number | null;
  /** When unloading completes. */
  departMin: number | null;
}

/** Reference to a saved-plan shipment that overlaps a planner-result row by (DC, PLD). */
export interface SavedPlanOverlapRef {
  planId: string;
  planName: string;
  shipmentId: string;
}

export interface Shipment {
  id: string;
  orderDate: string;
  truckType: string;
  serviceType: ServiceType;
  totalCbm: number;
  totalWeightKg: number;
  cbmUtilizationPct: number;
  weightUtilizationPct: number;
  drops: string[];
  /** Per-stop sequence and leg distances (same order as `drops`). */
  dropStops: ShipmentDropStop[];
  orders: ShipmentOrderLine[];
  /** `depart(last) - arrive(first)` in minutes when time simulation ran; otherwise null. */
  tripDurationMin: number | null;
  /**
   * Saved-plan shipments this shipment overlaps with by (DC, PLD).
   * Present only when consolidation was given a savedPlanDcPldIndex and the shipment
   * was emitted as a quarantined single-(DC,PLD) shipment.
   */
  overlapsSavedPlans?: SavedPlanOverlapRef[];
}

export interface UnassignedOrder {
  order: EnrichedOrderLine | OrderLine;
  reason: string;
  /**
   * Saved plans this unassigned order overlaps with. Set when the unassigned reason is
   * the duplicate-PO guard (the matching PO came from a saved plan), and when the order's
   * (DC, PLD) is in the saved-plan DC+PLD index.
   */
  overlapsSavedPlans?: SavedPlanOverlapRef[];
}

export interface ConsolidationResult {
  shipments: Shipment[];
  unassignedOrders: UnassignedOrder[];
}

export interface PlannerDataState {
  rawOrders: RawOrderCsvRow[];
  rawItemMaster: RawItemMasterCsvRow[];
  rawAddressMaster: RawAddressMasterCsvRow[];
  rawTruckMaster: RawTruckMasterCsvRow[];
}
