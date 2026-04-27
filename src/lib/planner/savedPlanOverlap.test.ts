import { describe, expect, it } from "vitest";

import { buildDcPldIndex, dcPldKey, type DcPldIndexEntry } from "@/lib/planner/savedPlanOverlap";
import { buildSavedPlanPoIndexMap } from "@/lib/savedPlansStore";

const ENTRY_A: DcPldIndexEntry = {
  dcName: "DC1",
  pld: "2026-04-28",
  planId: "spl_a",
  planName: "Alpha",
  shipmentId: "ALPHA-1",
};
const ENTRY_B: DcPldIndexEntry = {
  dcName: "DC1",
  pld: "2026-04-28",
  planId: "spl_b",
  planName: "Beta",
  shipmentId: "BETA-1",
};

describe("dcPldKey", () => {
  it("lowercases the DC and trims surrounding whitespace", () => {
    expect(dcPldKey("  Dc1  ", "2026-04-28")).toBe("dc1|2026-04-28");
  });
});

describe("buildDcPldIndex", () => {
  it("groups entries by (dcName, pld) and dedupes refs by planId+shipmentId", () => {
    const map = buildDcPldIndex([ENTRY_A, ENTRY_A, ENTRY_B]);
    const refs = map.get(dcPldKey("DC1", "2026-04-28"));
    expect(refs).toBeDefined();
    expect(refs!.map((r) => r.planId)).toEqual(["spl_a", "spl_b"]);
  });

  it("ignores entries with empty dcName or pld", () => {
    const map = buildDcPldIndex([
      { ...ENTRY_A, dcName: "" },
      { ...ENTRY_A, pld: "" },
    ]);
    expect(map.size).toBe(0);
  });
});

describe("buildSavedPlanPoIndexMap", () => {
  it("groups by PO key and dedupes refs by planId+shipmentId", () => {
    const map = buildSavedPlanPoIndexMap([
      { po: "po-1", planId: "spl_a", planName: "Alpha", shipmentId: "ALPHA-1" },
      { po: "po-1", planId: "spl_a", planName: "Alpha", shipmentId: "ALPHA-1" },
      { po: "po-1", planId: "spl_b", planName: "Beta", shipmentId: "BETA-1" },
      { po: "po-2", planId: "spl_a", planName: "Alpha", shipmentId: "ALPHA-1" },
    ]);
    expect(map.get("po-1")?.map((r) => r.planId)).toEqual(["spl_a", "spl_b"]);
    expect(map.get("po-2")?.map((r) => r.planId)).toEqual(["spl_a"]);
  });
});
