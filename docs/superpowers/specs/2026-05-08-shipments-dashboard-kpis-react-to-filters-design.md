# Shipments Dashboard KPIs React to Filters (Design)

## Context
The Shipments dashboard page (`src/app/shipments/page.tsx`) renders KPI cards and other summary cards using server-computed stats derived from the full dataset (`rows`).

Filtering, however, is implemented only in the client component `src/app/shipments/ShipmentsHeaderAndStopsClient.tsx`, which computes `filteredRows` and passes those rows only to the table.

Result: dashboard KPIs and summary cards do not change when filters change.

## Goal
Make **all KPI/dashboard cards on the Shipments page** react immediately to the currently applied filters, i.e. their values should be computed from the same filtered dataset shown in the table.

“All KPI/dashboard cards” includes:
- Plan snapshot
- KPI tiles (Total qty / Total kg / Schedule coverage)
- Top DCs / Top origins / Service mix
- Capacity roll-up
- Truck types

## Non-goals
- Persist filters to URL/search params.
- Introduce server-side recomputation of stats per filter change.
- Change the data model of saved plans/shipments.

## Constraints / Observations
- Filtering is currently client state (React `useState`) and computed via `filteredRows = useMemo(() => rows.filter(...))`.
- Server components cannot react to client state changes. Therefore, any UI that must respond to filters must be computed/rendered in the client (or filters must be promoted to URL/search params).

## Approach (Approved): Client-owned dashboard rendering
### Summary
Move dashboard aggregation + rendering into a client component that owns filter state, computes `filteredRows`, then derives dashboard stats from `filteredRows`.

### Why this approach
- Immediate reactivity with minimal plumbing.
- Avoids URL/state synchronization complexity and navigation-based updates.
- Reuses existing filter logic already implemented in `ShipmentsHeaderAndStopsClient.tsx`.

## Proposed Architecture
### Data flow
1. Server component (`src/app/shipments/page.tsx`) continues to fetch/assemble `rows` (SavedShipmentTableRow[]).
2. A new (or refactored) client component receives `rows` as props and:
   - renders filter UI
   - computes `filteredRows`
   - computes `stats` from `filteredRows`
   - renders all KPI/dashboard cards and the table using the same `filteredRows`

### Module boundaries
- Extract pure aggregation helpers currently in `src/app/shipments/page.tsx` into a shared module:
  - `planIdFromRow`
  - `bumpCount`
  - `topEntries`
  - `aggregateShipmentsDashboard(rows)`
- Place these in `src/lib/shipments/aggregateShipmentsDashboard.ts` (or similar).
  - Must be “client-safe” (no Node APIs), since it will run in the browser.

### Component structure (logical)
- `ShipmentsDashboardClient`
  - Filter bar (existing UI from `ShipmentsHeaderAndStopsClient`)
  - Dashboard cards (existing markup from `page.tsx`)
  - `ShipmentsSavedPlansTable` (existing)

## UI/UX Requirements
- **KPI subtitles/labels** should accurately reflect filtered context (e.g. “Across filtered shipments” vs “Across all saved shipments”).
- **Empty state** when `filteredRows.length === 0`:
  - Numeric KPIs show `0`
  - Bar lists show existing empty labels (e.g. “No DC data yet.”)
  - Schedule coverage should avoid divide-by-zero and show `100%` with “No stops” (current behavior).

## Acceptance Criteria
- Changing any filter in the filter bar updates:
  - all dashboard KPI numbers
  - all bar list breakdowns
  - the table rows
  - without page reload/navigation
- Clearing filters restores the dashboard stats to match the unfiltered dataset.

## Risks / Trade-offs
- Dashboard content becomes client-rendered (no SSR for the dashboard sections). Data is still provided by the server, but aggregation and presentation happen in the browser.
- If the dataset grows very large, client-side aggregation might become noticeably slower; current approach assumes the dataset size is manageable for in-browser aggregation.

