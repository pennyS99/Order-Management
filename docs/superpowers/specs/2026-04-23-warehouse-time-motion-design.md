# Warehouse Time Motion Design

Date: 2026-04-23
Status: Draft approved in chat, pending final user review

## Goal

Add a new planner settings page named `Warehouse Time Motion` with four numeric settings persisted in the database first, without changing any routing or planner logic.

## Scope

### In scope

- New settings page under planner settings for `Warehouse Time Motion`.
- Four settings fields:
  1. `Picking MP` (number)
  2. `Picking Rate (Cases/Hour)` (number)
  3. `Loading Dock` (number)
  4. `Loading Rate (Cases/Hour)` (number)
- Persist data using existing `app_settings` table.
- Add typed DB wrapper for read/write and validation.
- Seed defaults when missing.

### Out of scope

- Any routing, consolidation, sequencing, or planner engine behavior changes.
- Any usage of these values in runtime routing logic.

## Storage Model

Use existing `app_settings` key-value table with numeric values.

Keys:

- `planner.warehouse_time_motion.picking_mp`
- `planner.warehouse_time_motion.picking_rate_cases_per_hour`
- `planner.warehouse_time_motion.loading_dock`
- `planner.warehouse_time_motion.loading_rate_cases_per_hour`

Rationale:

- Reuses existing persistence pattern and avoids schema migration.
- Faster to deliver while keeping type safety via wrapper module.

## Defaults

Create defaults if values are missing:

- Picking MP = `2`
- Picking Rate (Cases/Hour) = `1000`
- Loading Dock = `3`
- Loading Rate (Cases/Hour) = `1500`

## Validation Rules

- All four fields required.
- Must be finite numbers.
- `Picking MP` and `Loading Dock`: integer and `>= 0`.
- Rate fields: `>= 0` (decimal allowed).

## UX / UI

Page title: `Warehouse Time Motion`

Form fields:

- `Picking MP`
- `Picking Rate (Cases/Hour)`
- `Loading Dock`
- `Loading Rate (Cases/Hour)`

Behavior:

- Load current values from DB on page load.
- If missing, seed defaults then display them.
- Save validates input and upserts all four settings.
- Show success/error feedback after save.

## Technical Design

### New module

`src/lib/db/warehouseTimeMotion.ts`

Responsibilities:

- Encapsulate setting keys/constants.
- Provide typed DTO.
- Read settings from `app_settings`.
- Seed defaults when missing.
- Validate and upsert settings.

Proposed API:

- `getWarehouseTimeMotionSettings(): Promise<WarehouseTimeMotionSettings>`
- `upsertWarehouseTimeMotionSettings(input: WarehouseTimeMotionSettingsInput): Promise<void>`

### Page and actions

- `src/app/settings/planner/warehouse-time-motion/page.tsx` (server page)
- `src/components/settings/WarehouseTimeMotionClient.tsx` (form UI)
- `src/app/actions/warehouseTimeMotion.ts` (save action, if server actions pattern is used)

### Navigation

Add a link entry to the planner settings navigation to open this page.

## Error Handling

- Invalid inputs return user-friendly validation errors.
- DB failures return a generic save/load error with safe logging server-side.

## Testing Plan

- Load page with empty settings: defaults appear and are persisted.
- Save valid edited values: values persist after refresh.
- Invalid values (blank, non-number, negative, invalid integer where required): blocked and surfaced.
- Verify no planner/routing engine files are touched.
- Verify existing settings pages still work.

## Risks and Mitigations

- Risk: inconsistent key usage across files.
  - Mitigation: centralize keys in one DB wrapper module only.
- Risk: accidental future coupling to routing logic.
  - Mitigation: keep integration explicitly out of scope and avoid touching planner engine files.

## Implementation Boundary

This design intentionally stops at data persistence and settings UI only. Runtime planning behavior will be handled in a separate scoped change.
