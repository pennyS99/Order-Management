import { describe, expect, it } from "vitest";
import { buildStateFromStorage, defaultColumnsByTab, normalizeOrder } from "./results-columns";

describe("planner results columns", () => {
  it("falls back to defaults when storage is invalid", () => {
    const state = buildStateFromStorage("not-an-object");
    expect(state.version).toBe(1);
    expect(state.columnsByTab.dc.length).toBe(defaultColumnsByTab().dc.length);
  });

  it("resets to defaults when version mismatches", () => {
    const state = buildStateFromStorage({ version: 999, columnsByTab: {} });
    expect(state.columnsByTab.po.map((c) => c.id)).toEqual(normalizeOrder(defaultColumnsByTab().po).map((c) => c.id));
  });

  it("adds new default columns missing from stored config", () => {
    const defaults = defaultColumnsByTab().dc;
    const stored = defaults.slice(0, 3).map((c, i) => ({ ...c, order: i }));
    const state = buildStateFromStorage({ version: 1, columnsByTab: { dc: stored, po: [], unassigned: [] } });
    expect(state.columnsByTab.dc.map((c) => c.id)).toEqual(normalizeOrder(defaults).map((c) => c.id));
  });

  it("drops unknown columns in stored config", () => {
    const state = buildStateFromStorage({
      version: 1,
      columnsByTab: {
        dc: [
          { id: "no", label: "No.", enabled: true, order: 0 },
          { id: "unknown", label: "X", enabled: true, order: 1 },
        ],
        po: [],
        unassigned: [],
      },
    });
    expect(state.columnsByTab.dc.some((c) => c.id === "unknown")).toBe(false);
    expect(state.columnsByTab.dc[0]?.id).toBe("no");
  });

  it("falls back to defaults when a tab ends up with all columns disabled", () => {
    const defaults = normalizeOrder(defaultColumnsByTab().po);
    const allDisabled = defaults.map((c) => ({ ...c, enabled: false }));
    const state = buildStateFromStorage({ version: 1, columnsByTab: { dc: [], po: allDisabled, unassigned: [] } });
    expect(state.columnsByTab.po.some((c) => c.enabled)).toBe(true);
    expect(state.columnsByTab.po.map((c) => c.id)).toEqual(defaults.map((c) => c.id));
  });

  it("appends missing default columns at the end (after stored ordering)", () => {
    const defaults = normalizeOrder(defaultColumnsByTab().po);
    const stored = [
      { id: "no", order: 0, enabled: true, label: "No." },
      { id: "shipmentId", order: 1000, enabled: true, label: "Shipment" },
    ];
    const state = buildStateFromStorage({ version: 1, columnsByTab: { dc: [], po: stored, unassigned: [] } });

    const ids = state.columnsByTab.po.map((c) => c.id);
    const shipmentIdx = ids.indexOf("shipmentId");
    const dcNameIdx = ids.indexOf("dcName");
    expect(shipmentIdx).toBeGreaterThanOrEqual(0);
    expect(dcNameIdx).toBeGreaterThanOrEqual(0);
    expect(dcNameIdx).toBeGreaterThan(shipmentIdx);
    expect(ids[ids.length - 1]).toBe(defaults[defaults.length - 1]!.id);
  });

  it("preserves stored label/enabled overrides for matching ids", () => {
    const state = buildStateFromStorage({
      version: 1,
      columnsByTab: {
        dc: [{ id: "dcName", label: "Warehouse", enabled: false, order: 1 }],
        po: [],
        unassigned: [],
      },
    });
    const dcName = state.columnsByTab.dc.find((c) => c.id === "dcName");
    expect(dcName).toBeTruthy();
    expect(dcName?.label).toBe("Warehouse");
    expect(dcName?.enabled).toBe(false);
  });
});

