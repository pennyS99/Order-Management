import { describe, expect, it } from "vitest";

import { runConsolidation } from "@/lib/consolidation/engine";
import { dcPldKey } from "@/lib/planner/savedPlanOverlap";
import type {
  PlannerDataState,
  RawAddressMasterCsvRow,
  RawItemMasterCsvRow,
  RawOrderCsvRow,
  RawTruckMasterCsvRow,
  SavedPlanOverlapRef,
} from "@/types/planner";

const TODAY = "2026-04-27";
const TOMORROW = "2026-04-28";

function order(overrides: Partial<RawOrderCsvRow>): RawOrderCsvRow {
  return {
    "Order Date": "2026-04-27",
    "Purchase Order": "PO-1",
    "DC Name": "DC1",
    PLD: TOMORROW,
    Item: "ITEM_A",
    Cases: "1",
    ...overrides,
  };
}

function buildData(orders: RawOrderCsvRow[]): PlannerDataState {
  const itemMaster: RawItemMasterCsvRow[] = [
    { ITEM: "ITEM_A", CBM: "0.05", "Weight (KG)": "5" },
    // Heavy enough that one case alone exceeds CDD (2000kg) but fits Wingbox (10000kg).
    { ITEM: "ITEM_HEAVY", CBM: "0.1", "Weight (KG)": "1500" },
    // Massive enough that even 1 case exceeds the largest land truck — forces unassigned.
    { ITEM: "ITEM_GIANT", CBM: "0.2", "Weight (KG)": "20000" },
  ];

  const addressMaster: RawAddressMasterCsvRow[] = [
    {
      dcName: "DC1",
      latitude: "35.0",
      longitude: "139.0",
      Province: "Kanto",
      Origin: "TokyoHub",
      "Transport Mode": "LAND",
      registerOpen: "08:00",
      registerClosed: "17:00",
      unloadDurationMin: "30",
      "leadtime_ftl/fcl": "1",
      "leadtime_ltl/lcl": "2",
    },
    {
      dcName: "DC2",
      latitude: "34.5",
      longitude: "135.5",
      Province: "Kansai",
      Origin: "TokyoHub",
      "Transport Mode": "LAND",
      registerOpen: "08:00",
      registerClosed: "17:00",
      unloadDurationMin: "30",
      "leadtime_ftl/fcl": "1",
      "leadtime_ltl/lcl": "2",
    },
    {
      dcName: "DC3",
      latitude: "35.1",
      longitude: "139.1",
      Province: "Kanto",
      Origin: "TokyoHub",
      "Transport Mode": "LAND",
      registerOpen: "08:00",
      registerClosed: "17:00",
      unloadDurationMin: "30",
      "leadtime_ftl/fcl": "1",
      "leadtime_ltl/lcl": "2",
    },
  ];

  const truckMaster: RawTruckMasterCsvRow[] = [
    { "Truck Type": "CDD", Kg: "2000", CBM: "12" },
    { "Truck Type": "wingbox", Kg: "10000", CBM: "30" },
  ];

  return {
    rawOrders: orders,
    rawItemMaster: itemMaster,
    rawAddressMaster: addressMaster,
    rawTruckMaster: truckMaster,
  };
}

const REF_ALPHA: SavedPlanOverlapRef = {
  planId: "spl_alpha",
  planName: "Alpha Plan",
  shipmentId: "ALPHA-CDD-0001",
};
const REF_BETA: SavedPlanOverlapRef = {
  planId: "spl_beta",
  planName: "Beta Plan",
  shipmentId: "BETA-CDD-0001",
};

describe("runConsolidation — saved-plan-aware quarantine", () => {
  it("emits one quarantined shipment for a single matched (DC, PLD) order with overlap metadata", () => {
    const data = buildData([order({ "Purchase Order": "PO-1", "DC Name": "DC1", PLD: TOMORROW })]);
    const savedPlanDcPldIndex = new Map<string, SavedPlanOverlapRef[]>([
      [dcPldKey("DC1", TOMORROW), [REF_ALPHA]],
    ]);

    const result = runConsolidation(data, { savedPlanDcPldIndex });

    expect(result.shipments).toHaveLength(1);
    const s = result.shipments[0]!;
    expect(s.drops).toEqual(["DC1"]);
    expect(s.orders).toHaveLength(1);
    expect(s.overlapsSavedPlans).toEqual([REF_ALPHA]);
  });

  it("groups multiple new orders sharing the same (DC, PLD) into ONE quarantined shipment", () => {
    const data = buildData([
      order({ "Purchase Order": "PO-1", "DC Name": "DC1", PLD: TOMORROW, Cases: "2" }),
      order({ "Purchase Order": "PO-2", "DC Name": "DC1", PLD: TOMORROW, Cases: "3" }),
    ]);
    const savedPlanDcPldIndex = new Map<string, SavedPlanOverlapRef[]>([
      [dcPldKey("DC1", TOMORROW), [REF_ALPHA]],
    ]);

    const result = runConsolidation(data, { savedPlanDcPldIndex });

    expect(result.shipments).toHaveLength(1);
    const s = result.shipments[0]!;
    expect(s.drops).toEqual(["DC1"]);
    expect(s.orders.map((o) => o.purchaseOrder).sort()).toEqual(["PO-1", "PO-2"]);
    expect(s.overlapsSavedPlans).toEqual([REF_ALPHA]);
  });

  it("never merges quarantined orders with non-overlapping orders even when they share a DC", () => {
    // Same DC, same PLD: one order's (DC, PLD) is in the saved-plan index, the other isn't.
    // Without quarantine these would form a single-DC shipment. With quarantine the matched one
    // is held back and emitted separately.
    const data = buildData([
      order({ "Purchase Order": "PO-MATCH", "DC Name": "DC1", PLD: TOMORROW }),
      order({ "Purchase Order": "PO-FREE", "DC Name": "DC1", PLD: "2026-04-29" }),
    ]);
    const savedPlanDcPldIndex = new Map<string, SavedPlanOverlapRef[]>([
      [dcPldKey("DC1", TOMORROW), [REF_ALPHA]],
    ]);

    const result = runConsolidation(data, { savedPlanDcPldIndex });

    expect(result.shipments).toHaveLength(2);
    const matched = result.shipments.find((s) => s.overlapsSavedPlans);
    const free = result.shipments.find((s) => !s.overlapsSavedPlans);
    expect(matched).toBeDefined();
    expect(free).toBeDefined();
    expect(matched!.orders.map((o) => o.purchaseOrder)).toEqual(["PO-MATCH"]);
    expect(free!.orders.map((o) => o.purchaseOrder)).toEqual(["PO-FREE"]);
    expect(matched!.overlapsSavedPlans).toEqual([REF_ALPHA]);
  });

  it("attaches all matching saved plans when two plans cover the same (DC, PLD)", () => {
    const data = buildData([order({ "Purchase Order": "PO-1", "DC Name": "DC1", PLD: TOMORROW })]);
    const savedPlanDcPldIndex = new Map<string, SavedPlanOverlapRef[]>([
      [dcPldKey("DC1", TOMORROW), [REF_ALPHA, REF_BETA]],
    ]);

    const result = runConsolidation(data, { savedPlanDcPldIndex });
    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0]!.overlapsSavedPlans).toEqual([REF_ALPHA, REF_BETA]);
  });

  it("does not quarantine orders whose (DC, PLD) is not in the index", () => {
    const data = buildData([
      order({ "Purchase Order": "PO-1", "DC Name": "DC1", PLD: TOMORROW }),
      order({ "Purchase Order": "PO-2", "DC Name": "DC2", PLD: TOMORROW }),
    ]);
    const savedPlanDcPldIndex = new Map<string, SavedPlanOverlapRef[]>([
      [dcPldKey("DC3", TOMORROW), [REF_ALPHA]], // unrelated DC
    ]);

    const result = runConsolidation(data, { savedPlanDcPldIndex });

    expect(result.unassignedOrders).toHaveLength(0);
    for (const s of result.shipments) {
      expect(s.overlapsSavedPlans).toBeUndefined();
    }
  });

  it("does not quarantine orders with empty PLD even if DC matches an indexed key", () => {
    const data = buildData([order({ "Purchase Order": "PO-1", "DC Name": "DC1", PLD: "" })]);
    const savedPlanDcPldIndex = new Map<string, SavedPlanOverlapRef[]>([
      [dcPldKey("DC1", TOMORROW), [REF_ALPHA]],
    ]);

    const result = runConsolidation(data, { savedPlanDcPldIndex });
    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0]!.overlapsSavedPlans).toBeUndefined();
  });
});

describe("runConsolidation — duplicate-PO chip metadata", () => {
  it("keeps the duplicate-PO unassigned reason and attaches overlapsSavedPlans from savedPlanPoIndex", () => {
    const data = buildData([order({ "Purchase Order": "PO-DUPE" })]);
    const savedPlanPoIndex = new Map<string, SavedPlanOverlapRef[]>([
      ["po-dupe", [REF_ALPHA]],
    ]);

    const result = runConsolidation(data, { savedPlanPoIndex });

    expect(result.shipments).toHaveLength(0);
    expect(result.unassignedOrders).toHaveLength(1);
    const u = result.unassignedOrders[0]!;
    expect(u.reason).toMatch(/Duplicate PO Number 'PO-DUPE'/);
    expect(u.overlapsSavedPlans).toEqual([REF_ALPHA]);
  });

  it("falls back to blockedPurchaseOrders Set without chip metadata when savedPlanPoIndex is absent", () => {
    const data = buildData([order({ "Purchase Order": "PO-DUPE" })]);
    const blockedPurchaseOrders = new Set<string>(["po-dupe"]);

    const result = runConsolidation(data, { blockedPurchaseOrders });

    expect(result.shipments).toHaveLength(0);
    expect(result.unassignedOrders).toHaveLength(1);
    expect(result.unassignedOrders[0]!.reason).toMatch(/Duplicate PO Number 'PO-DUPE'/);
    expect(result.unassignedOrders[0]!.overlapsSavedPlans).toBeUndefined();
  });
});

describe("runConsolidation — non-matching orders unchanged", () => {
  it("leaves regular orders to consolidate exactly as before when no index is provided", () => {
    const data = buildData([
      order({ "Purchase Order": "PO-1", "DC Name": "DC1", PLD: TOMORROW }),
      order({ "Purchase Order": "PO-2", "DC Name": "DC1", PLD: TOMORROW }),
    ]);

    const result = runConsolidation(data);

    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0]!.orders).toHaveLength(2);
    expect(result.shipments[0]!.overlapsSavedPlans).toBeUndefined();
  });

  it("keeps regular orders untouched when an unrelated index is provided alongside them", () => {
    const data = buildData([
      order({ "Purchase Order": "PO-FREE-1", "DC Name": "DC2", PLD: TOMORROW }),
      order({ "Purchase Order": "PO-FREE-2", "DC Name": "DC2", PLD: TOMORROW }),
    ]);
    const savedPlanDcPldIndex = new Map<string, SavedPlanOverlapRef[]>([
      [dcPldKey("DC1", TOMORROW), [REF_ALPHA]],
    ]);

    const result = runConsolidation(data, { savedPlanDcPldIndex });

    expect(result.shipments).toHaveLength(1);
    const s = result.shipments[0]!;
    expect(s.orders).toHaveLength(2);
    expect(s.overlapsSavedPlans).toBeUndefined();
  });
});

describe("runConsolidation — quarantine bucket too large to fit a single truck", () => {
  it("splits the bucket into multiple shipments, all tagged with overlap metadata", () => {
    // Wingbox max is 10,000kg / 30 cbm. Each ITEM_HEAVY case is 1,500kg / 0.1 cbm. 14 cases of
    // ITEM_HEAVY = 21,000kg, which exceeds wingbox in two trucks. Engine partitions into fitting
    // sub-groups, each becomes its own quarantined shipment.
    const data = buildData([
      order({
        "Purchase Order": "PO-HEAVY",
        "DC Name": "DC1",
        PLD: TOMORROW,
        Item: "ITEM_HEAVY",
        Cases: "14",
      }),
    ]);
    const savedPlanDcPldIndex = new Map<string, SavedPlanOverlapRef[]>([
      [dcPldKey("DC1", TOMORROW), [REF_ALPHA]],
    ]);

    const result = runConsolidation(data, { savedPlanDcPldIndex });

    expect(result.shipments.length).toBeGreaterThanOrEqual(2);
    for (const s of result.shipments) {
      expect(s.drops).toEqual(["DC1"]);
      expect(s.overlapsSavedPlans).toEqual([REF_ALPHA]);
    }
  });

  it("oversized single line falls into Unassigned but still carries overlap metadata", () => {
    const data = buildData([
      order({
        "Purchase Order": "PO-GIANT",
        "DC Name": "DC1",
        PLD: TOMORROW,
        Item: "ITEM_GIANT",
        Cases: "1",
      }),
    ]);
    const savedPlanDcPldIndex = new Map<string, SavedPlanOverlapRef[]>([
      [dcPldKey("DC1", TOMORROW), [REF_ALPHA]],
    ]);

    const result = runConsolidation(data, { savedPlanDcPldIndex });

    expect(result.shipments).toHaveLength(0);
    expect(result.unassignedOrders).toHaveLength(1);
    expect(result.unassignedOrders[0]!.overlapsSavedPlans).toEqual([REF_ALPHA]);
  });
});

describe("dcPldKey", () => {
  it("normalizes DC name to lowercase + trim and joins with the ISO PLD", () => {
    expect(dcPldKey("  DC1  ", "2026-04-28")).toBe("dc1|2026-04-28");
  });

  it("treats different DC casings as the same key", () => {
    expect(dcPldKey("Dc1", "2026-04-28")).toBe(dcPldKey("DC1", "2026-04-28"));
  });

  // TODAY is referenced in fixtures so the import isn't unused even when test cases skip it.
  it("uses today as a placeholder for engine-side date logic", () => {
    expect(dcPldKey("DC1", TODAY)).toBe(`dc1|${TODAY}`);
  });
});
