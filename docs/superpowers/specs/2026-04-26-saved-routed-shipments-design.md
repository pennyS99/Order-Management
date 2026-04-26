# Saved Routed Shipments Design

Date: 2026-04-26
Status: Draft approved in chat, pending final user review

## Goal

Let planner users save a completed routed-shipment result as a named "saved plan", browse those plans on a dedicated page, view a saved plan's shipments grouped by Plan Loading Date (PLD) with a route map, and reload a saved plan back into the live planner for further editing.

## Scope

### In scope

- Manual `Save plan` button on the planner results section that persists a full snapshot of the consolidation run.
- Server-side persistence under `data/saved-plans/` (one JSON file per plan + a thin index file).
- New page `/planner/saved` that lists saved plans (newest first) with Open / Rename / Delete actions.
- New detail page `/planner/saved/[id]` with:
  - PLD tab strip (`All PLDs`, one tab per PLD, `Unknown PLD` when applicable).
  - Route map (reuses `PlannerShipmentsOverviewMap`) bound to the current tab's shipments.
  - Read-only `By DC` and `By PO` tables matching the live planner's columns.
  - Read-only `Unassigned` panel.
  - `Load into planner` action that hydrates `PlannerContext` and routes back to `/planner`.
  - `Export XLSX` that exports the currently selected tab (WYSIWYG).
- Self-healing index that rebuilds from `readdir` if it drifts from the per-plan files on disk.

### Out of scope

- Search / filter on the saved-plans list (YAGNI for v1).
- Multi-user concurrency, locking, or auth.
- Cross-plan PLD aggregation (calendar view across saved plans).
- Sharing / importing saved-plan JSON between machines.
- Any change to the consolidation engine, routing logic, or planner outputs.

## Storage Model

Server-side JSON, mirroring the existing pattern used by `data/masters.json`, `data/app-settings.json`, etc., but split per record:

- `data/saved-plans/_index.json` — array of `SavedPlanMetadata` (cheap to read for the list page).
- `data/saved-plans/<id>.json` — the full `SavedPlan` payload.

Rationale: per-plan files keep the list page fast at any scale, prevent each save from rewriting all snapshots, and cap the blast radius of corruption to a single plan.

### Self-healing index

When the API reads `_index.json` it cross-checks against the directory contents:

- An index entry whose file is missing is dropped from the in-memory list and removed on next write.
- A plan file with no index entry is appended (lazily reading just `meta` from the file).
- Both conditions cause the index to be rewritten atomically.

This makes the index a cache rather than the source of truth, so manual file deletion / restore from backups stays safe.

## Types

`src/types/savedPlan.ts`:

```ts
import type {
  ConsolidationResult,
  RawAddressMasterCsvRow,
  RawItemMasterCsvRow,
  RawOrderCsvRow,
  RawTruckMasterCsvRow,
} from "@/types/planner";

export interface SavedPlanMetadata {
  id: string;                 // "spl_" + ulid/uuid
  name: string;               // user-provided, unique (case-insensitive) across saved plans
  savedAt: number;            // epoch ms
  shipmentCount: number;
  unassignedCount: number;
  totalOrders: number;
  pldList: string[];          // ISO "YYYY-MM-DD", sorted ascending, deduped
  hasUnknownPld: boolean;     // true if any order has empty/unparseable pld
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
```

`dcCoordinates` is snapshotted (not just derived from `inputs.rawAddressMaster`) so the saved-plan map renders identically even if address master changes later.

## Validation

- Name: required, trimmed, 1–80 chars, no leading/trailing whitespace, must not collide (case-insensitive) with an existing saved plan unless the user explicitly chooses Replace.
- Save is only allowed when `consolidationResult.shipments.length > 0`.
- Save button is disabled while planning is running and hidden when no shipments exist.
- On the API: reject malformed payloads (missing fields, bad shape) with a generic 400 plus a developer log.

## APIs

All under `src/app/api/planner/saved-plans/`:

- `POST /api/planner/saved-plans` — create. Body `{ name, consolidationResult, inputs, dcCoordinates }`. Returns `{ meta }`. Returns `409` with `{ existingId }` on case-insensitive name collision.
- `GET /api/planner/saved-plans` — list metadata, sorted by `savedAt` desc. Returns `{ plans: SavedPlanMetadata[] }`.
- `GET /api/planner/saved-plans/[id]` — full plan.
- `PUT /api/planner/saved-plans/[id]` — replace existing plan with same id. Used by the Replace branch (called after a `409` from `POST`).
- `PATCH /api/planner/saved-plans/[id]` — rename. Body `{ name }`. Same `409` on collision.
- `DELETE /api/planner/saved-plans/[id]` — delete file + index entry.

`POST` and `PUT` use `writeJsonFileAtomic` from `src/lib/storage/jsonFile.ts` for both the per-plan file and the index. The index is updated last; if writing the index fails after the per-plan write succeeded, the next read self-heals.

## UX / UI

### Save flow (planner page)

- New `Save plan` button in the results header next to `Export XLSX`.
- Clicking opens a dialog:
  - Name field, default `plan-YYYYMMDD-HHmm` (local time).
  - Summary line: `<N> shipments · <M> orders · <K> PLDs`.
  - Primary action `Save`. Cancel closes.
- On collision (case-insensitive name match):
  - Dialog stays open and presents two actions in place of `Save`: `Replace existing` (overwrites the matched plan, keeping its `id`, updating `savedAt`) and `Save as…` (returns focus to the name field).
- On success: inline confirmation `Saved as <name>` plus a link `View saved plans` pointing to `/planner/saved`.
- On failure: inline error in the dialog, dialog stays open for retry.

### List page (`/planner/saved`)

- Header with page title `Saved plans` and a `Back to planner` link.
- Empty state: dashed-border card matching the planner's "No consolidation yet" panel, with a `Go to planner` CTA.
- Rows are cards (newest first) showing:
  - Name (primary text).
  - `Saved: <relative>` with absolute timestamp on hover/title attribute.
  - Chips: `<N> shipments`, `<M> orders`, `<K> unassigned` (only if > 0), and one chip per PLD formatted `dd-MMM-yy`. PLD chips are capped at 3 visible plus `+N more` when longer.
  - Right-side actions: `Open` (primary), `Rename`, `Delete`.
- `Rename` reuses the save-dialog component with the same collision flow.
- `Delete` opens a standard confirm dialog `Delete this saved plan? [Cancel] [Delete]` with destructive-styled primary button. (The typed-`DELETE` modal pattern is reserved for irreversible bulk wipes.)

### Detail page (`/planner/saved/[id]`)

Top to bottom:

1. Header: breadcrumb `Saved plans / <name>`. Right-side actions `Load into planner`, `Export XLSX`, `Rename`, `Delete`. Subline: `Saved: <relative + absolute>` · `<N> shipments` · `<M> orders` · `<K> unassigned`.
2. PLD tab strip:
   - `All PLDs` (default selected).
   - One tab per entry of `meta.pldList`, label formatted `dd-MMM-yy`.
   - `Unknown PLD` shown only when `meta.hasUnknownPld`.
3. Route map: existing `PlannerShipmentsOverviewMap` fed with the filtered shipment subset and `dcCoordinates` from the saved plan. Same expand-to-fullscreen behavior as the live planner. Maps always draw the **full** route of each visible shipment regardless of tab — partial routes by PLD would be misleading.
4. `By DC` and `By PO` tables: same columns as the live planner, but read-only (no drag-to-reassign, no `Move to…` controls).
5. `Unassigned` section: same as live planner, filtered by current tab.

### Multi-PLD shipment behavior

A shipment whose orders span multiple PLDs appears under each of its PLD tabs. Within a single-PLD tab, rows whose `pld` matches the tab render normally; rows whose `pld` differs render in a muted style with a small `other PLD` chip, so it's visually clear which lines drove the shipment's inclusion under that tab. The `All PLDs` tab renders all rows normally.

### Load into planner

`Load into planner` calls a new context method `hydrateFromSavedPlan(savedPlan)` exposed by `PlannerContext`. It populates:

- `data.rawOrders / rawItemMaster / rawAddressMaster / rawTruckMaster` from `savedPlan.inputs`.
- `consolidationResult` from `savedPlan.consolidationResult`.
- A new `loadedFromSavedPlan: { id, name } | null` slice on the context.

Then it routes the user to `/planner`, where a small banner above the results reads `Loaded from saved plan: <name>` with a `Clear` action that clears the planner state back to empty.

### Export XLSX from detail page

Reuses the existing planner export logic with the currently filtered shipments. Filename pattern:

- Tab `All PLDs` → `<plan-name>-<yyyy-mm-dd>.xlsx`
- Tab `<PLD>` → `<plan-name>-pld-<pld-iso>-<yyyy-mm-dd>.xlsx`
- Tab `Unknown PLD` → `<plan-name>-unknown-pld-<yyyy-mm-dd>.xlsx`

The trailing `<yyyy-mm-dd>` is the current local date at export time, matching the live planner's existing convention.

## Technical Design

### New files

- `src/types/savedPlan.ts` — types above.
- `src/lib/savedPlansStore.ts` — server-only module owning all reads/writes:
  - `listSavedPlans(): Promise<SavedPlanMetadata[]>` (with self-heal).
  - `loadSavedPlan(id): Promise<SavedPlan | null>` (with `schemaVersion` migration hook).
  - `createSavedPlan(input): Promise<SavedPlanMetadata>`.
  - `replaceSavedPlan(id, input): Promise<SavedPlanMetadata>`.
  - `renameSavedPlan(id, name): Promise<SavedPlanMetadata>`.
  - `deleteSavedPlan(id): Promise<void>`.
  - `migrateSavedPlan(plan)` — pure function for future schema changes.
- `src/app/api/planner/saved-plans/route.ts` — `GET` (list), `POST` (create).
- `src/app/api/planner/saved-plans/[id]/route.ts` — `GET`, `PATCH` (rename), `PUT` (replace), `DELETE`.
- `src/app/planner/saved/page.tsx` — list page (server component fetching the list).
- `src/app/planner/saved/[id]/page.tsx` — detail page (server component fetching the plan, hands data to a client component).
- `src/components/planner/SavedPlansList.tsx` — client component for the list with Rename/Delete dialogs.
- `src/components/planner/SavedPlanDetail.tsx` — client component owning the PLD tab state, map, tables, hydration, and export.
- `src/components/planner/SavePlanDialog.tsx` — shared dialog used for save and rename, including the collision Replace/Save-as branches.

### Changes to existing files

- `src/context/PlannerContext.tsx`:
  - Add `loadedFromSavedPlan: { id: string; name: string } | null` to state.
  - Add `hydrateFromSavedPlan(plan: SavedPlan)` and `clearLoadedFromSavedPlan()` to the context value.
- `src/components/planner/PlannerResults.tsx`:
  - Add `Save plan` button to the header (disabled while planning, hidden when no shipments).
  - Render the loaded-from-saved-plan banner with `Clear` when `loadedFromSavedPlan` is set.
  - Reuse `SavePlanDialog` for the save flow.
- `src/app/planner/page.tsx`:
  - Add a `Saved plans` link in the existing layout (header area).
- Refactor the planner-export logic into a reusable function (e.g. `src/lib/planner/exportXlsx.ts`) so both the live planner and the saved-plan detail page can call it without duplication. Keeps `PlannerResults.tsx` smaller and decouples export from the live React tree.

### File size note

The "By DC" / "By PO" / export builders currently live inline in `PlannerResults.tsx`, which is already a large file. As part of this work, those pure functions will move into `src/lib/planner/buildResultRows.ts` (and `exportXlsx.ts`) so the saved-plan detail page can reuse them. No behavior changes.

## Error Handling

- Save failures (disk, permissions): inline error in the dialog; dialog stays open for retry.
- Index drift: self-healing rebuild on every read; the rebuild is also written back atomically.
- Detail page on unknown id: friendly "Saved plan not found" state with a back link.
- Map: re-uses existing missing-coordinate and OSRM-failure messaging in `PlannerShipmentsOverviewMap`.
- Schema mismatch (`schemaVersion !== 1`): "This saved plan was created with a different version" panel; future migrations are added behind `migrateSavedPlan`.
- Rename to colliding name: same Replace / Save as resolution as save.
- Deleting a plan currently being viewed in another tab: detected on the next API call (`404`); the detail page renders the "Saved plan not found" panel with a back link, matching the unknown-id handling above.

## Edge Cases

- Empty / unparseable `pld` → bucketed under `Unknown PLD`. The tab is shown only when at least one such order exists.
- Multi-PLD shipment → appears under each of its PLDs (per design choice). Other-PLD rows are visually muted in single-PLD tabs.
- Loading into planner overwrites in-memory planner state. The banner makes that visible; a `Clear` button reverts to empty state.
- Atomic-write failures mid-flight: per-plan file is the source of truth; if the index write fails, self-heal restores the entry on next read.

## Testing Plan

- Save dialog: required name, max 80 chars, whitespace trim, collision detection (case-insensitive).
- Save collision: Replace overwrites same id and updates `savedAt`; Save as creates a new id.
- Save button: disabled while planning is running; hidden when shipments are empty.
- API: create, list, get, rename, replace, delete round-trip; list is sorted by `savedAt` desc.
- API self-heal: deleting `_index.json` rebuilds it from per-plan files; deleting a per-plan file removes it from list on next read and rewrites the index.
- List page: empty state; rows render correct chips; Open / Rename / Delete actions work; Delete confirm dialog requires confirmation.
- Detail page: `All PLDs` tab is default; per-date tabs derived from `meta.pldList`; `Unknown PLD` tab only when applicable.
- Detail page: multi-PLD shipment appears under each PLD; other-PLD rows render muted in single-PLD tabs.
- Detail page map: full routes drawn regardless of tab; coordinates come from the snapshot.
- Export: filename includes the selected tab; output matches what's on screen.
- Hydration: `Load into planner` populates orders, masters, and consolidation result; banner shows on `/planner`; `Clear` wipes back.
- Schema-version mismatch: friendly message instead of crash.

## Risks and Mitigations

- **Index drift** — mitigated by self-healing rebuild on read, with the per-plan file as source of truth.
- **Saved-plan size growth** — full snapshots can be MB-sized for large runs. Per-plan files contain the impact; the list page reads only metadata; only one detail at a time is loaded into the browser.
- **Schema evolution** — `schemaVersion` and a `migrateSavedPlan` hook keep the door open without committing to a migration today.
- **PlannerContext refactor scope creep** — the only changes are the new hydration method and the `loadedFromSavedPlan` slice; no rewrites to existing reducer cases.
- **Duplicated export logic** — addressed by extracting export/build helpers into `src/lib/planner/`, used by both the live planner and the detail page.

## Implementation Boundary

This design adds persistence, two new pages, and a hydration path. It does not change the consolidation engine, routing math, time-window logic, or any existing planner output. The shared helpers extracted from `PlannerResults.tsx` move without behavior changes.
