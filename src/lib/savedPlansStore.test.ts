import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  listFutureDcPldIndex,
  listSavedPlanPoIndex,
  listSavedPurchaseOrders,
} from "@/lib/savedPlansStore";
import type { SavedPlan } from "@/types/savedPlan";

const TODAY = "2026-04-27";
const PAST = "2026-03-01";
const FUTURE = "2026-05-01";

let originalCwd: string;
let tempDir: string;

function makePlan(planId: string, planName: string, plds: string[]): SavedPlan {
  return {
    schemaVersion: 1,
    meta: {
      id: planId,
      name: planName,
      savedAt: 1_700_000_000_000,
      shipmentCount: 1,
      unassignedCount: 0,
      totalOrders: plds.length,
      pldList: Array.from(new Set(plds)).sort(),
      hasUnknownPld: false,
    },
    consolidationResult: {
      shipments: [
        {
          id: `${planId.toUpperCase()}-CDD-0001`,
          orderDate: "2026-04-27",
          truckType: "CDD",
          serviceType: "FTL",
          totalCbm: 1,
          totalWeightKg: 100,
          cbmUtilizationPct: 50,
          weightUtilizationPct: 50,
          drops: ["DC1"],
          dropStops: [
            {
              sequence: 1,
              dcName: "DC1",
              previousDcName: null,
              legFromPreviousKm: null,
              legFromPreviousMin: null,
              arriveMin: null,
              unloadStartMin: null,
              departMin: null,
            },
          ],
          orders: plds.map((pld, idx) => ({
            orderDate: "2026-04-27",
            purchaseOrder: `${planId}-PO-${idx}`,
            dcName: "DC1",
            pld,
            item: "ITEM_A",
            cases: 1,
            totalCbm: 0.05,
            totalWeightKg: 5,
            province: "Kanto",
            dropSequence: 1,
          })),
          tripDurationMin: null,
        },
      ],
      unassignedOrders: [],
    },
    inputs: {
      rawOrders: [],
      rawItemMaster: [],
      rawAddressMaster: [],
      rawTruckMaster: [],
    },
    dcCoordinates: [{ dcName: "DC1", lat: 35, lng: 139 }],
  };
}

async function writePlan(plan: SavedPlan): Promise<void> {
  const dir = path.join(tempDir, "data", "saved-plans");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${plan.meta.id}.json`), JSON.stringify(plan), "utf8");
}

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "saved-plans-test-"));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("listFutureDcPldIndex", () => {
  it("includes only orders with PLD >= today", async () => {
    await writePlan(makePlan("spl_mix", "Mixed", [PAST, FUTURE]));

    const entries = await listFutureDcPldIndex({ today: TODAY });

    expect(entries.map((e) => e.pld)).toEqual([FUTURE]);
    expect(entries[0]).toMatchObject({
      dcName: "DC1",
      planId: "spl_mix",
      planName: "Mixed",
    });
  });

  it("skips plans whose every PLD is in the past", async () => {
    await writePlan(makePlan("spl_old", "Old", [PAST]));
    await writePlan(makePlan("spl_new", "New", [FUTURE]));

    const entries = await listFutureDcPldIndex({ today: TODAY });

    expect(entries.map((e) => e.planId)).toEqual(["spl_new"]);
  });

  it("excludes the plan whose id matches excludePlanId", async () => {
    await writePlan(makePlan("spl_loaded", "Loaded", [FUTURE]));
    await writePlan(makePlan("spl_other", "Other", [FUTURE]));

    const entries = await listFutureDcPldIndex({ today: TODAY, excludePlanId: "spl_loaded" });

    expect(entries.map((e) => e.planId)).toEqual(["spl_other"]);
  });
});

describe("listSavedPurchaseOrders + listSavedPlanPoIndex", () => {
  it("returns POs from all plans regardless of date and respects excludePlanId", async () => {
    await writePlan(makePlan("spl_old", "Old", [PAST]));
    await writePlan(makePlan("spl_new", "New", [FUTURE]));

    const allSet = await listSavedPurchaseOrders();
    expect(allSet.has("spl_old-po-0")).toBe(true);
    expect(allSet.has("spl_new-po-0")).toBe(true);

    const allEntries = await listSavedPlanPoIndex();
    const planIds = new Set(allEntries.map((e) => e.planId));
    expect(planIds.has("spl_old")).toBe(true);
    expect(planIds.has("spl_new")).toBe(true);

    const excludedSet = await listSavedPurchaseOrders({ excludePlanId: "spl_old" });
    expect(excludedSet.has("spl_old-po-0")).toBe(false);
    expect(excludedSet.has("spl_new-po-0")).toBe(true);

    const excludedEntries = await listSavedPlanPoIndex({ excludePlanId: "spl_old" });
    const excludedPlanIds = new Set(excludedEntries.map((e) => e.planId));
    expect(excludedPlanIds.has("spl_old")).toBe(false);
    expect(excludedPlanIds.has("spl_new")).toBe(true);
  });
});
