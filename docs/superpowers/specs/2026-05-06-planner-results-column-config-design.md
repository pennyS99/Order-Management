---
title: Configurable columns for Planner results table (local)
date: 2026-05-06
area: planner
---

## Goal
Add an in-app column configuration UI for the Planner results tables so users can:
- Re-order columns
- Rename column headers (display labels)
- Enable/disable columns

Configuration is saved locally (browser `localStorage`) and affects the on-screen results tables only.

## Non-goals
- Changing exported XLSX columns (future follow-up; keep design extensible)
- Adding authentication, server-side persistence, or multi-device sync
- Changing planner consolidation logic or the underlying row data shapes

## UX design
- Add a **Columns** control in the Planner results area, adjacent to the results tabs:
  - Tabs: `DC stops`, `PO lines`, `Unassigned`
  - Columns button applies to the *currently selected tab*
- Clicking **Columns** opens a panel (dialog/drawer) showing the column list for the current tab:
  - Reorder via drag-and-drop and/or up/down buttons
  - Toggle visibility (enabled/disabled)
  - Editable label input (disabled when column is disabled)
  - `Reset defaults` action to restore the default schema for the current tab
- Empty-state behavior:
  - If all columns are disabled (or an invalid config is loaded), fall back to defaults (and rewrite config)

## Column config model
Use stable internal column ids per tab; labels are user-editable.

```ts
type PlannerResultsTab = "dc" | "po" | "unassigned";

type PlannerColumnConfig = {
  id: string;       // stable key, e.g. "dcName"
  label: string;    // display header (editable)
  enabled: boolean; // show/hide
  order: number;    // 0..n-1
};

type PlannerResultsColumnsStateV1 = {
  version: 1;
  columnsByTab: Record<PlannerResultsTab, PlannerColumnConfig[]>;
};
```

Storage key:
- `planner-results-columns:v1`

## Defaults and migration/merge rules
Planner results have three independent tables; define a default schema per tab (in code).

On load, construct the effective config with this process:
- Start from per-tab defaults (source of truth for available columns)
- If stored state exists and is valid JSON, merge it:
  - Keep user settings for matching column `id`s (label/enabled/order)
  - Add new default columns missing from storage (append at end, enabled by default unless product wants otherwise)
  - Drop unknown stored columns not present in defaults (prevents stale ids after refactors)
  - Normalize `order` to a dense 0..n-1 sequence after merge
- If stored state is missing/invalid, use defaults
- Persist the merged/normalized state back to `localStorage` (so later code paths can assume shape)

Versioning:
- If `version` is missing or not `1`, treat as invalid and reset to defaults (this is acceptable while we only have local persistence).

## Table rendering approach
Current Planner results tables are rendered as manual `<table>` markup. Implement column configuration by:
- Maintaining a column definition list per tab:
  - `id`
  - default label
  - cell renderer (function that reads from the row)
  - optional responsive visibility rules (existing `hidden ... md:table-cell` patterns)
- Deriving the displayed columns by filtering/sorting the column definitions using the effective config:
  - Only render enabled columns
  - Render in configured order
  - Use configured label for `<th>`

Important constraint:
- Some columns currently have hard-coded responsive hide/show via Tailwind classes. Column config should not break responsiveness.
- Recommended rule: column config controls *whether a column exists*; responsive classes still apply. (Future improvement could allow pinning “always visible”.)

## State management
Mirror the existing PO header configuration pattern:
- Create a small context provider (e.g. `PlannerColumnsContext`) responsible for:
  - loading defaults
  - merging with `localStorage`
  - exposing getters/setters per tab
  - reset-to-default for a tab
- Add a tab-scoped UI component (e.g. `PlannerColumnsConfig`) similar to `src/components/po/HeaderConfig.tsx`.

## Error handling
- Guard against malformed `localStorage` values:
  - try/catch JSON parse
  - validate minimal shape (array of objects with `id`)
  - fallback to defaults
- Ensure at least one enabled column per tab:
  - if user disables all columns, show a small inline error in the config panel and offer `Reset defaults`
  - optionally auto-reenable a minimal set (defaults) for safety

## Testing
- Unit tests (Vitest) for:
  - merge/normalize behavior (new columns added, unknown columns dropped, ordering normalized)
  - version mismatch resets to defaults
- Basic UI sanity:
  - toggling enabled hides/shows in table
  - renaming updates the header
  - reorder changes column position

## Success criteria
- User can reorder, rename, and show/hide columns for each Planner results tab.
- Config persists across reloads on the same browser.
- New columns added in future releases appear automatically without breaking existing configs.

