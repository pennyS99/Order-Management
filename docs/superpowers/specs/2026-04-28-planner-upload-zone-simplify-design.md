---
title: Simplify Planner upload zone to single button
date: 2026-04-28
area: planner
---

## Goal
Simplify the Planner page “Orders” file input from a drag-and-drop dropzone to a single, clear button while preserving existing behavior and validation handled by `PlannerContext`.

## Non-goals
- Changing upload parsing/validation logic
- Adding additional required files beyond the existing `orders` input
- Changing planner consolidation logic or results rendering

## UX design
- **Primary control**: One primary button, label:
  - `Choose Orders file` (idle)
  - `Replace Orders file` (after a file is selected)
- **After selection**:
  - Show `✓ <filename>` as a secondary status line.
  - Provide a small “Replace” action (optional; button label already supports replacing).
- **Removed**:
  - Drag & drop behaviors and dashed dropzone UI
  - Large upload icon / “Drop … or browse” copy
- **Kept**:
  - Existing accepted file types (CSV/XLSX/XLSM/XLS)
  - `Plan routes →` button behavior and enabled/disabled logic
  - Existing status/error messages (`mastersLoaded`, `mastersError`, `consolidationPlanningError`)
  - Existing progress UI during planning (`PlannerRouteProgress`)

## Technical approach
- Update `src/components/upload/CsvUploadPanel.tsx`:
  - Remove `isDragOver` state and drag handlers
  - Render a hidden file input + a button that triggers `inputRef.current?.click()`
  - Keep `uploadCsv("orders", file)` and clear input value after change

## Success criteria
- User can upload/replace Orders file using a single button.
- Selected filename is visible.
- No regressions to planning flow and existing errors/progress rendering.

