# Shipments Dashboard KPIs React to Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all KPI/dashboard cards on `src/app/shipments/page.tsx` recompute from the currently filtered rows, updating instantly when filters change.

**Architecture:** Keep server data fetching in `src/app/shipments/page.tsx`, but move dashboard aggregation + rendering into a client component that owns filter state and derives both the table and KPI cards from the same `filteredRows`.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS.

---

## File structure / responsibilities

**Create**
- `src/lib/shipments/aggregateShipmentsDashboard.ts`: Pure, client-safe aggregation helpers (no React). Exports `aggregateShipmentsDashboard(rows)` plus any small helper types.
- `src/app/shipments/ShipmentsDashboardClient.tsx`: Client component that owns filters, computes `filteredRows`, computes `stats`, renders filter UI, KPI/dashboard cards, and the table.

**Modify**
- `src/app/shipments/page.tsx`: Remove server-side dashboard rendering/aggregation; keep server data build and render `ShipmentsDashboardClient rows={rows}`.
- `src/app/shipments/ShipmentsHeaderAndStopsClient.tsx`: Either delete/replace with a small wrapper, or refactor it to only export filter UI pieces (depending on simplest diff). Preferred: keep it as-is temporarily, then migrate logic into `ShipmentsDashboardClient` and stop using this file.

## Task 1: Extract aggregation helpers into shared lib

**Files:**
- Create: `src/lib/shipments/aggregateShipmentsDashboard.ts`
- Modify: `src/app/shipments/page.tsx` (remove inline helper functions after new import is ready)

- [ ] **Step 1: Create the shared aggregation module**

Create `src/lib/shipments/aggregateShipmentsDashboard.ts`:

```ts
import type { SavedShipmentTableRow } from "@/components/planner/ShipmentsSavedPlansTable";

function planIdFromRow(shipmentId: string): string {
  const i = shipmentId.indexOf("::");
  return i >= 0 ? shipmentId.slice(0, i) : "";
}

function bumpCount(map: Map<string, number>, key: string, delta = 1) {
  const k = key.trim() || "—";
  map.set(k, (map.get(k) ?? 0) + delta);
}

function topEntries(map: Map<string, number>, n: number): { label: string; count: number }[] {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export function aggregateShipmentsDashboard(rows: SavedShipmentTableRow[]) {
  const planIds = new Set<string>();
  const shipmentKeys = new Set<string>();
  const truckMap = new Map<string, number>();
  const serviceMap = new Map<string, number>();
  const dcMap = new Map<string, number>();
  const originMap = new Map<string, number>();
  let totalQty = 0;
  let totalKg = 0;
  let totalCbm = 0;
  let stopsWithTimingGap = 0;

  for (const row of rows) {
    const pid = planIdFromRow(row.shipmentId);
    if (pid) planIds.add(pid);
    shipmentKeys.add(row.shipmentId);
    bumpCount(truckMap, row.truckType);
    bumpCount(serviceMap, row.serviceType);
    bumpCount(dcMap, row.dcName);
    bumpCount(originMap, row.origin || "—");
    totalQty += row.totalQty;
    totalKg += row.totalKg;
    totalCbm += row.totalCbm;
    if (row.arriveClock === "—" || row.departClock === "—") stopsWithTimingGap += 1;
  }

  const maxDc = topEntries(dcMap, 1)[0]?.count ?? 1;
  const maxOrigin = topEntries(originMap, 1)[0]?.count ?? 1;
  const maxService = topEntries(serviceMap, 1)[0]?.count ?? 1;

  return {
    planCount: planIds.size,
    routedShipmentCount: shipmentKeys.size,
    stopCount: rows.length,
    totalQty,
    totalKg,
    totalCbm,
    stopsWithTimingGap,
    topDc: topEntries(dcMap, 5),
    topOrigin: topEntries(originMap, 5),
    serviceBreakdown: topEntries(serviceMap, 6),
    truckBreakdown: topEntries(truckMap, 5),
    maxDc,
    maxOrigin,
    maxService,
  };
}
```

- [ ] **Step 2: Run TypeScript check**

Run:
- `npm run typecheck` (or the repo’s equivalent)

Expected: PASS.

## Task 2: Create `ShipmentsDashboardClient` that derives KPIs from `filteredRows`

**Files:**
- Create: `src/app/shipments/ShipmentsDashboardClient.tsx`
- Modify: `src/app/shipments/page.tsx`

- [ ] **Step 1: Create the client component**

Create `src/app/shipments/ShipmentsDashboardClient.tsx` and:
- Copy filter UI + filtering logic from `ShipmentsHeaderAndStopsClient.tsx`
- Copy dashboard card markup from `page.tsx`
- Use `const filteredRows = useMemo(...);`
- Compute `const stats = useMemo(() => aggregateShipmentsDashboard(filteredRows), [filteredRows]);`
- Compute `timingPct` from `stats` (same formula)
- Render the table with `rows={filteredRows}`

Key imports to include:
- `useMemo`, `useState` from React
- `Link` (for map link)
- lucide icons used by dashboard sections
- `ShipmentsSavedPlansTable`
- `cn` helper (if still needed)
- `aggregateShipmentsDashboard`

- [ ] **Step 2: Update `src/app/shipments/page.tsx` to render the client dashboard**

Replace dashboard rendering in the server component with:
- `<ShipmentsDashboardClient rows={rows} />`

Keep the server-side data preparation (masters lookup, `rows` assembly) intact.

- [ ] **Step 3: Verify runtime behavior manually**

Run dev server:
- `npm run dev`

Navigate to `/shipments` and verify:
- Changing any filter updates all KPI/dashboard card values and the table.
- Clear resets everything.
- Empty filtered result shows 0 KPIs and empty breakdown lists without crashing.

## Task 3: Cleanup and lint/type verification

**Files:**
- Modify: `src/app/shipments/ShipmentsHeaderAndStopsClient.tsx` (optional: keep if still used elsewhere; otherwise remove or leave but unused)

- [ ] **Step 1: Remove dead code / unused imports**

If `ShipmentsHeaderAndStopsClient` is no longer used:
- Either delete it or keep it but ensure there are no unused exports/imports.

- [ ] **Step 2: Run lint + typecheck**

Run:
- `npm run lint`
- `npm run typecheck`

Expected: PASS.

---

## Self-review checklist
- All dashboard sections now depend on `filteredRows` (not the full `rows`).
- No server component tries to read client state.
- Aggregation code is pure and client-safe.
- `/shipments` loads without hydration warnings, and filters update KPIs instantly.

