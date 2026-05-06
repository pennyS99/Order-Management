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
});

