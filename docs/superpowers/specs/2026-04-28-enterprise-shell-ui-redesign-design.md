# Enterprise shell UI redesign (PO Extract + global shell)

Date: 2026-04-28  
Repo: `Order-Management-HUB` (this workspace)  
Reference repo: `pennyS99/enterprise-ui-suite`

## Goal

Adopt the `enterprise-ui-suite` **application shell pattern** (sidebar + top header) across the entire app, while keeping the **internal UI** of:

- Planner (`/planner`)
- Shipments (`/shipments`)
- Settings (`/configure`)

…functionally and structurally the same.

Additionally, standardize the PO Extract (`/extract`) page header/actions to match the enterprise “compact page header” style.

## Non-goals

- No redesign of Planner/Shipments/Settings core components, flows, or data models.
- No routing changes.
- No new features for search/notifications (they remain UI-only unless already implemented).
- No cross-repo dependency import (we will not install or consume `enterprise-ui-suite` as a package).

## Current state (this repo)

- The app already contains enterprise-style components:
  - `src/components/enterprise/EnterpriseAppShell.tsx`
  - `src/components/enterprise/EnterpriseSidebar.tsx`
  - `src/components/enterprise/EnterpriseToolbar.tsx`
  - `src/components/enterprise/nav.ts`
- PO Extract is implemented at `src/app/extract/page.tsx` and currently renders its own page header/actions.
- A second, separate shell exists: `src/components/po/PoAppShell.tsx` (top navigation header).

## Target UX

### 1) Single global shell everywhere

All routes render inside the enterprise shell:

- Left: **Enterprise sidebar** with grouped navigation (Operations / Planning) and pinned Admin.
- Top: **Sticky top bar** with:
  - Breadcrumbs (Transport Ops → Section → Page)
  - Global search input with “⌘K” keycap (visual only)
  - Notifications icon with dot indicator (visual only)
  - “Dark Ops” environment chip (visual only)
  - Initials avatar

### 2) Remove `PoAppShell`

The `PoAppShell` header/nav is removed from usage so there is only one navigation system.

### 3) Keep Planner/Shipments/Settings as-is (internals)

Planner and Shipments keep their existing layout/components. They may appear inside the enterprise shell’s content area but their internal component trees remain unchanged.

#### Settings sticky header decision

Settings (`/configure`) currently uses an internal `sticky top-0` header. Because the enterprise shell already provides a sticky top bar, Settings’ internal header will become **non-sticky** (remove stickiness) to avoid double-sticky overlap.

### 4) PO Extract: enterprise-style compact page header

PO Extract keeps its extraction logic and results table, but its page header aligns to the enterprise pattern:

- Left: title “Extracted PO lines”, row-count badge, and “POs · SKUs” stat line.
- Right: refresh, export, upload actions as compact buttons.

## Design approach options considered

### Option A (selected): Use existing `EnterpriseAppShell` as the global wrapper

**Why**

- Matches the reference repo’s shell layout and interaction patterns.
- Minimizes churn because the theme tokens and enterprise classes already exist in `globals.css`.
- Keeps page internals intact; changes are primarily layout/wrapping and small page-header alignment on `/extract`.

### Option B: Port `enterprise-ui-suite` `AppShell` verbatim

Rejected due to higher churn and stack mismatch (TanStack Router + Vite + Tailwind v4 CSS pipeline vs Next App Router + existing theming).

### Option C: Partial visual alignment only

Rejected because the request explicitly wants PO Extract + sidebar + header to use the reference repo’s pattern across the app.

## Implementation outline (high level)

1. **Make `EnterpriseAppShell` the default wrapper**
   - Wrap `children` in `src/app/layout.tsx` with `EnterpriseAppShell`.
   - Ensure existing providers (`AppProviders`) remain in place.

2. **Remove `PoAppShell` usage**
   - Identify any pages/layouts using `PoAppShell` and replace with the global shell (or remove wrapper).
   - Keep the file if still referenced by tests/other code; otherwise delete as cleanup (optional, separate commit if desired).

3. **Settings header non-sticky**
   - In `src/app/configure/page.tsx`, remove `sticky top-0` behavior from its internal header container.
   - Confirm spacing looks correct under the global top bar.

4. **PO Extract compact header alignment**
   - Keep extraction state machine and actions intact.
   - Adjust spacing/layout to match enterprise compact header rhythm and reduce duplication with global breadcrumbs.

## Acceptance criteria

- All routes show the **enterprise sidebar + top bar** consistently.
- `PoAppShell` is no longer used for navigation.
- Planner, Shipments, and Settings **retain their existing UI behavior and components**.
- Settings’ internal header is **not sticky** and does not overlap the global top bar.
- PO Extract page header/actions visually align with the enterprise compact header style without breaking extraction.

## Risks & mitigations

- **Double-padding/max-width conflicts** (Planner page uses `max-w-6xl`, shell uses full width)
  - Mitigation: prefer minimal changes; only adjust where obviously cramped or misaligned.
- **Sticky stacking contexts** (Settings header)
  - Mitigation: remove internal stickiness as specified.

