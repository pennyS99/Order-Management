# Planner results column configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users reorder/rename/show-hide columns for the Planner results tables, configured in `/configure` (Planner data), persisted in `localStorage`, and consumed by `/planner` results tables.

**Architecture:** Add a small `PlannerResultsColumnsProvider` that owns defaults + `localStorage` merge/migration. Add a configure UI component to edit per-tab column configs. Refactor the three Planner results tables to render columns from a tab-specific definition list filtered/sorted by the saved config.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind, Vitest.

---

## Scope check
This plan covers a single subsystem (Planner results columns configuration) and is implementable independently.

## File structure (new/modified)

**Create**
- `src/context/PlannerResultsColumnsContext.tsx` — load defaults, merge with stored state, expose getters/setters + reset.
- `src/components/planner/PlannerResultsColumnsConfig.tsx` — configure UI (reorder/rename/toggle/reset) for a selected tab.
- `src/lib/planner/results-columns.ts` — pure functions/types (defaults, merge/normalize, validation) for easy testing.
- `src/lib/planner/results-columns.test.ts` — Vitest unit tests for merge/normalize/version behavior.

**Modify**
- `src/app/providers.tsx` — wrap app in `PlannerResultsColumnsProvider`.
- `src/app/configure/page.tsx` — add “Results columns” entry under Planner data view and render the config UI.
- `src/components/planner/PlannerResults.tsx` — refactor DC/PO/Unassigned table header+cells to use configured columns.

---

### Task 1: Add pure column-config primitives + tests

**Files:**
- Create: `src/lib/planner/results-columns.ts`
- Test: `src/lib/planner/results-columns.test.ts`

- [ ] **Step 1: Create `results-columns.ts` with types and defaults**

```ts
// src/lib/planner/results-columns.ts
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
      { id: "origin", label: "Origin", enabled: true, order: 1 },
      { id: "shipmentId", label: "Shipment ID", enabled: true, order: 2 },
      { id: "dropSequence", label: "Drop #", enabled: true, order: 3 },
      { id: "dcName", label: "DC Name", enabled: true, order: 4 },
      { id: "channelType", label: "Channel Type", enabled: true, order: 5 },
      { id: "poNumber", label: "PO Number", enabled: true, order: 6 },
      { id: "startPicking", label: "Start Picking Time", enabled: true, order: 7 },
      { id: "plt", label: "PLT", enabled: true, order: 8 },
      { id: "pld", label: "PLD", enabled: true, order: 9 },
      { id: "rad", label: "RAD", enabled: true, order: 10 },
      { id: "poExpiredDate", label: "PO Expired Date", enabled: true, order: 11 },
      { id: "legKm", label: "Drive km (leg)", enabled: true, order: 12 },
      { id: "legMin", label: "Drive min (leg)", enabled: true, order: 13 },
      { id: "arrive", label: "Arrive (sim)", enabled: true, order: 14 },
      { id: "unloadStart", label: "Unload start", enabled: true, order: 15 },
      { id: "depart", label: "Depart (unload end)", enabled: true, order: 16 },
      { id: "tripDur", label: "Trip duration", enabled: true, order: 17 },
      { id: "totalQty", label: "Qty", enabled: true, order: 18 },
      { id: "totalKg", label: "KG", enabled: true, order: 19 },
      { id: "totalCbm", label: "CBM", enabled: true, order: 20 },
      { id: "utilizationPct", label: "Utilization %", enabled: true, order: 21 },
      { id: "truckType", label: "Truck Type", enabled: true, order: 22 },
      { id: "serviceType", label: "Service Type", enabled: true, order: 23 },
    ],
    po: [
      { id: "no", label: "No.", enabled: true, order: 0 },
      { id: "origin", label: "Origin", enabled: true, order: 1 },
      { id: "shipmentId", label: "Shipment ID", enabled: true, order: 2 },
      { id: "dropSequence", label: "Drop #", enabled: true, order: 3 },
      { id: "dcName", label: "DC Name", enabled: true, order: 4 },
      { id: "channelType", label: "Channel Type", enabled: true, order: 5 },
      { id: "poNumber", label: "PO Number", enabled: true, order: 6 },
      { id: "item", label: "Item", enabled: true, order: 7 },
      { id: "cases", label: "Cases", enabled: true, order: 8 },
      { id: "pld", label: "PLD", enabled: true, order: 9 },
      { id: "rad", label: "RAD", enabled: true, order: 10 },
      { id: "poExpiredDate", label: "PO Expired Date", enabled: true, order: 11 },
      { id: "truckType", label: "Truck Type", enabled: true, order: 12 },
      { id: "serviceType", label: "Service Type", enabled: true, order: 13 },
    ],
    unassigned: [
      { id: "no", label: "No.", enabled: true, order: 0 },
      { id: "dcName", label: "DC Name", enabled: true, order: 1 },
      { id: "poNumber", label: "PO Number", enabled: true, order: 2 },
      { id: "item", label: "Item", enabled: true, order: 3 },
      { id: "cases", label: "Cases", enabled: true, order: 4 },
      { id: "rad", label: "RAD", enabled: true, order: 5 },
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

  const byIdDefault = new Map(defaults.map((c) => [c.id, c]));
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
  const base: PlannerResultsColumnsStateV1 = { version: 1, columnsByTab: defaultsByTab };

  if (!raw || typeof raw !== "object") return { ...base, columnsByTab: {
    dc: normalizeOrder(defaultsByTab.dc),
    po: normalizeOrder(defaultsByTab.po),
    unassigned: normalizeOrder(defaultsByTab.unassigned),
  }};

  const parsed = raw as Partial<PlannerResultsColumnsStateV1>;
  if (parsed.version !== 1 || !parsed.columnsByTab) return { ...base, columnsByTab: {
    dc: normalizeOrder(defaultsByTab.dc),
    po: normalizeOrder(defaultsByTab.po),
    unassigned: normalizeOrder(defaultsByTab.unassigned),
  }};

  return {
    version: 1,
    columnsByTab: {
      dc: mergeStoredWithDefaults({ defaults: defaultsByTab.dc, stored: parsed.columnsByTab.dc }),
      po: mergeStoredWithDefaults({ defaults: defaultsByTab.po, stored: parsed.columnsByTab.po }),
      unassigned: mergeStoredWithDefaults({ defaults: defaultsByTab.unassigned, stored: parsed.columnsByTab.unassigned }),
    },
  };
}
```

- [ ] **Step 2: Write unit tests for merge/normalize/version reset**

```ts
// src/lib/planner/results-columns.test.ts
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
    expect(state.columnsByTab.po.map((c) => c.id)).toEqual(defaultColumnsByTab().po.map((c) => c.id));
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
        dc: [{ id: "no", label: "No.", enabled: true, order: 0 }, { id: "unknown", label: "X", enabled: true, order: 1 }],
        po: [],
        unassigned: [],
      },
    });
    expect(state.columnsByTab.dc.some((c) => c.id === "unknown")).toBe(false);
    expect(state.columnsByTab.dc[0]?.id).toBe("no");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS (the new test file is executed and passes)

- [ ] **Step 4: Commit**

```bash
git add src/lib/planner/results-columns.ts src/lib/planner/results-columns.test.ts
git commit -m "feat(planner): add results column config primitives"
```

---

### Task 2: Add `PlannerResultsColumnsProvider` (localStorage persistence)

**Files:**
- Create: `src/context/PlannerResultsColumnsContext.tsx`
- Modify: `src/app/providers.tsx`

- [ ] **Step 1: Create context + provider**

```tsx
// src/context/PlannerResultsColumnsContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import {
  PLANNER_RESULTS_COLUMNS_STORAGE_KEY,
  type PlannerResultsColumnsStateV1,
  type PlannerResultsTab,
  type PlannerColumnConfig,
  buildStateFromStorage,
  defaultColumnsByTab,
} from "@/lib/planner/results-columns";

type PlannerResultsColumnsContextValue = {
  state: PlannerResultsColumnsStateV1;
  getTabColumns: (tab: PlannerResultsTab) => PlannerColumnConfig[];
  setTabColumns: (tab: PlannerResultsTab, next: PlannerColumnConfig[]) => void;
  resetTab: (tab: PlannerResultsTab) => void;
};

const PlannerResultsColumnsContext = createContext<PlannerResultsColumnsContextValue | null>(null);

function readStorage(): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLANNER_RESULTS_COLUMNS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(state: PlannerResultsColumnsStateV1) {
  try {
    window.localStorage.setItem(PLANNER_RESULTS_COLUMNS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function PlannerResultsColumnsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlannerResultsColumnsStateV1>(() => buildStateFromStorage(null));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = readStorage();
    const merged = buildStateFromStorage(stored);
    setState(merged);
    setMounted(true);
    // Persist normalized shape back
    if (typeof window !== "undefined") writeStorage(merged);
  }, []);

  const getTabColumns = useCallback((tab: PlannerResultsTab) => state.columnsByTab[tab], [state]);

  const setTabColumns = useCallback((tab: PlannerResultsTab, next: PlannerColumnConfig[]) => {
    setState((prev) => {
      const merged: PlannerResultsColumnsStateV1 = { ...prev, columnsByTab: { ...prev.columnsByTab, [tab]: next } };
      if (mounted) writeStorage(merged);
      return merged;
    });
  }, [mounted]);

  const resetTab = useCallback((tab: PlannerResultsTab) => {
    const defaults = defaultColumnsByTab()[tab];
    setTabColumns(tab, defaults);
  }, [setTabColumns]);

  const value = useMemo<PlannerResultsColumnsContextValue>(() => ({
    state,
    getTabColumns,
    setTabColumns,
    resetTab,
  }), [state, getTabColumns, setTabColumns, resetTab]);

  return <PlannerResultsColumnsContext.Provider value={value}>{children}</PlannerResultsColumnsContext.Provider>;
}

export function usePlannerResultsColumns() {
  const ctx = useContext(PlannerResultsColumnsContext);
  if (!ctx) throw new Error("usePlannerResultsColumns must be used within PlannerResultsColumnsProvider");
  return ctx;
}
```

- [ ] **Step 2: Wire provider into app**

Modify `src/app/providers.tsx` to wrap inside existing providers:

```tsx
import { PlannerResultsColumnsProvider } from "@/context/PlannerResultsColumnsContext";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlannerProvider>
      <HeadersProvider>
        <PlannerResultsColumnsProvider>
          <EnterpriseAppShell>{children}</EnterpriseAppShell>
        </PlannerResultsColumnsProvider>
      </HeadersProvider>
    </PlannerProvider>
  );
}
```

- [ ] **Step 3: Run typecheck + tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/context/PlannerResultsColumnsContext.tsx src/app/providers.tsx
git commit -m "feat(planner): add localStorage-backed results columns provider"
```

---

### Task 3: Add Configure UI for “Results columns” under Planner data

**Files:**
- Create: `src/components/planner/PlannerResultsColumnsConfig.tsx`
- Modify: `src/app/configure/page.tsx`

- [ ] **Step 1: Create the config component**

```tsx
// src/components/planner/PlannerResultsColumnsConfig.tsx
"use client";

import React, { useMemo, useState } from "react";
import { GripVertical, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { Switch } from "@/components/po/ui/switch";
import { Input } from "@/components/po/ui/input";
import { Button } from "@/components/po/ui/button";
import { usePlannerResultsColumns } from "@/context/PlannerResultsColumnsContext";
import type { PlannerResultsTab, PlannerColumnConfig } from "@/lib/planner/results-columns";
import { normalizeOrder } from "@/lib/planner/results-columns";

const TAB_LABEL: Record<PlannerResultsTab, string> = {
  dc: "DC stops",
  po: "PO lines",
  unassigned: "Unassigned",
};

export function PlannerResultsColumnsConfig() {
  const { getTabColumns, setTabColumns, resetTab } = usePlannerResultsColumns();
  const [tab, setTab] = useState<PlannerResultsTab>("dc");

  const columns = getTabColumns(tab);
  const activeCount = columns.filter((c) => c.enabled).length;

  const reorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const next = columns.slice();
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    setTabColumns(tab, normalizeOrder(next));
  };

  const toggle = (id: string, enabled: boolean) => {
    setTabColumns(tab, columns.map((c) => (c.id === id ? { ...c, enabled } : c)));
  };

  const updateLabel = (id: string, label: string) => {
    setTabColumns(tab, columns.map((c) => (c.id === id ? { ...c, label } : c)));
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = Number.parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (!Number.isNaN(fromIndex)) reorder(fromIndex, toIndex);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#e0e0e0]">Results columns</h3>
          <p className="mt-0.5 text-xs text-[#888888]">
            Configure how columns appear in Planner results tables. Saved locally in this browser.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#888888]">{activeCount} of {columns.length} active</span>
          <Button variant="outline" size="sm" onClick={() => resetTab(tab)}>
            <RotateCcw className="mr-1 h-4 w-4" />
            Reset defaults
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(TAB_LABEL) as PlannerResultsTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t
                ? "border-[#1D9E75]/55 bg-[rgba(29,158,117,0.12)] text-[#1D9E75]"
                : "border-[#2a2a2a] bg-[#141414] text-[#888888] hover:text-[#e0e0e0]"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {columns.map((c, index) => (
          <li
            key={c.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            className="flex items-center gap-3 rounded-lg border border-[#2a2a2a] bg-[#141414] p-3"
          >
            <GripVertical className="h-5 w-5 text-[#555]" />
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded p-1 text-[#888888] hover:bg-[#1a1a1a] disabled:opacity-40"
                onClick={() => reorder(index, Math.max(0, index - 1))}
                disabled={index === 0}
                aria-label={`Move ${c.label} up`}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-[#888888] hover:bg-[#1a1a1a] disabled:opacity-40"
                onClick={() => reorder(index, Math.min(columns.length - 1, index + 1))}
                disabled={index === columns.length - 1}
                aria-label={`Move ${c.label} down`}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <Switch checked={c.enabled} onCheckedChange={(v) => toggle(c.id, !!v)} />
            <Input
              value={c.label}
              onChange={(e) => updateLabel(c.id, e.target.value)}
              disabled={!c.enabled}
              className="flex-1"
            />
            <span className="shrink-0 font-mono text-[11px] text-[#555]">{c.id}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Render the config component in `/configure` under Planner data**

In `src/app/configure/page.tsx`, inside `{view === "planner" && (...)}` (near where `MasterSettingsClient` is rendered), add a “Results columns” section at the top of the Planner view when `plannerMasterCategory === "list"`:

```tsx
import { PlannerResultsColumnsConfig } from "@/components/planner/PlannerResultsColumnsConfig";

{view === "planner" && plannerMasterCategory === "list" && (
  <div className="mb-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-6">
    <PlannerResultsColumnsConfig />
  </div>
)}
```

Keep `MasterSettingsClient` below it unchanged.

- [ ] **Step 3: Run dev server and verify Configure UI renders**

Run: `npm run dev`
Expected: `/configure` → Planner data shows “Results columns” editor and interacts without errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/planner/PlannerResultsColumnsConfig.tsx src/app/configure/page.tsx
git commit -m "feat(planner): add results columns editor under /configure"
```

---

### Task 4: Refactor `PlannerResults.tsx` tables to use configured columns

**Files:**
- Modify: `src/components/planner/PlannerResults.tsx`

- [ ] **Step 1: Add per-tab render definitions**

In `PlannerResults.tsx`, create a small set of column definitions for each tab (id → header label + cell renderer).
Example shape:

```ts
type RenderCol<Row> = {
  id: string;
  thClassName?: string;
  tdClassName?: string;
  getValue: (row: Row, index: number) => React.ReactNode;
};
```

Define:
- `DC_COLS: RenderCol<DcSummaryRowType>[]`
- `PO_COLS: RenderCol<PoSummaryRowType>[]`
- `UNASSIGNED_COLS: RenderCol<UnassignedRowType>[]`

Use the saved config:
- Import `usePlannerResultsColumns`
- For current `resultsTab`, compute `visibleCols`:
  - take config for the tab
  - filter enabled
  - map to matching definition by `id`
  - preserve config order
  - fallback to defaults if result is empty

- [ ] **Step 2: Replace hard-coded `<th>` and `<td>` sequences with a `.map`**

For each tab’s table:
- Render `<thead><tr>` by mapping `visibleCols` to `<th>`
- Render each `<tr>` mapping `visibleCols` to `<td>`
- Preserve existing responsive classnames by storing them in the column definitions.

- [ ] **Step 3: Manual smoke test in browser**

Steps:
- Start app: `npm run dev`
- Go to `/configure` → Planner data → Results columns
- Disable a column and rename another
- Go to `/planner`, run a plan (or load saved) so results show
- Confirm the table updates: hidden column removed, renamed header shown, reordered columns move

- [ ] **Step 4: Commit**

```bash
git add src/components/planner/PlannerResults.tsx
git commit -m "feat(planner): render results tables from configurable columns"
```

---

### Task 5: Lint + final verification

**Files:**
- Check: recently modified files above

- [ ] **Step 1: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS (or only pre-existing warnings, if any)

- [ ] **Step 3: Browser verification**

Verify:
- `/configure` planner shows editor
- changes persist after reload (localStorage)
- `/planner` tables respect config per tab

- [ ] **Step 4: Commit any last fixes**

```bash
git add -A
git commit -m "chore(planner): finalize results columns configuration"
```

---

## Self-review (completed now)
1. **Spec coverage:** Plan implements localStorage persistence, per-tab configs, reorder/rename/toggle, reset defaults, merge rules, consumption in `/planner`, and configuration UI in `/configure`.
2. **Placeholder scan:** No “TBD/TODO”; each step includes concrete code or commands.
3. **Type consistency:** Uses `PlannerResultsTab` union (`dc|po|unassigned`) consistently across store, UI, and consumer.

