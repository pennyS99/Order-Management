# Frontend redesign (Ops-Mintlify dashboard-first)

Date: 2026-05-09  
Repo: `om-automation` (this workspace)  
Input: `DESIGN.md` (Mintlify token language)

## Goal

Redesign the entire frontend into a cohesive, production-grade **operations workspace** UI that is **inspired by** the `DESIGN.md` system (hairlines, pill CTAs, disciplined accent usage, readable density), while staying compatible with the existing Next.js App Router structure and current component patterns.

## Non-goals

- No changes to backend/extraction algorithms, routing optimization logic, or data models.
- No “marketing landing page” experience. The app is a workspace; `/` is a dashboard.
- No component library migration (keep current Tailwind v4 + existing `src/components/po/ui/*` primitives).

## Current state (observed)

- App Router pages exist under:
  - `/planner`, `/planner/saved`, `/planner/saved/[id]`
  - `/shipments`, `/shipments/map`
  - `/extract`
  - `/configure` (and settings subroutes)
  - `/history`, `/uom-master`
  - `/` (currently a landing/hero-style page)
- A global shell already exists:
  - `src/components/enterprise/EnterpriseAppShell.tsx`
  - `src/components/enterprise/EnterpriseSidebar.tsx`
  - with a sticky topbar, breadcrumb, search pill, and “Ready” chip.
- The default theme is `data-theme="dark-ops"` in `src/app/layout.tsx`.
- Global tokens + many enterprise utility classes already exist in `src/app/globals.css`.

## Target UX

### 1) Dashboard-first navigation

`/` becomes **Dashboard (Overview)** and is the primary entry point.

- The enterprise shell (sidebar + topbar) stays as the global wrapper.
- Dashboard content is dense and scannable: KPIs, queues, recents, and quick actions.

### 2) Module pages remain, but feel “same product”

Existing pages keep their functional behavior, but their *visual language* is aligned:

- Consistent page headers
- Consistent card, grid, table, and form treatments
- Unified spacing and typography hierarchy

### 3) Visual language: “Ops‑Mintlify”

**Inspired by** `DESIGN.md` principles, tuned for ops:

- Hairline borders and calm surfaces
- Pill CTAs for primary/secondary actions
- Mint accent is a **signal**, used sparingly (primary CTA, focus ring, active nav, success)
- Dense tables and controls remain readable (14px base in ops mode)

## Information architecture (dashboard content model)

Dashboard sections (desktop layout uses a 12-col grid; collapses to 1-col on mobile):

- **KPI strip** (top)
  - Today’s shipments
  - Late risk / exceptions
  - Pending extractions
  - Saved plans (recent activity)
- **Now queue**
  - Extraction jobs (latest uploads + status)
  - Recent exports / downloads
- **Continue**
  - Recent saved plans
  - Recent shipments runs
- **Quick actions**
  - New Plan
  - Upload Orders
  - Open Shipments Map
  - Configure Masters

## Component inventory (new + standardized)

### New (Dashboard)

- `DashboardPage` (`src/app/page.tsx`)
- `DashboardKpiStrip` (composition of KPI cards)
- `DashboardQueue` (jobs/exports)
- `DashboardRecents` (saved plans / shipments)
- `QuickActions` (pill buttons)

### Standardized (global)

- **Page header**: compact title + description line + right-aligned actions
- **Cards**: consistent radius, border, background, hover
- **Tables**: consistent header density, hover, borders
- **Inputs**: consistent focus ring and height

## Design tokens & theming (implementation intent)

We will keep the existing `dark-ops` variable model and refine it to match the discipline of `DESIGN.md`:

- **Surfaces**: clearly separated ladder
  - `--background` (workspace canvas)
  - `--surface` (default panels)
  - `--surface-elevated` (headers, table theads, raised cards)
  - `--card` (card surfaces where needed)
- **Borders**: hairlines for structure; stronger borders only for focus/active
  - `--border` for standard dividers
  - `--border-strong` for emphasized separators and interactive focus contexts
- **Accent**: `--primary` remains mint; used for:
  - primary CTA backgrounds
  - focus ring
  - active nav and key status states

Typography intent:

- Keep `Inter` for UI and `JetBrains Mono` for IDs/CLI/code.
- Reduce “random” font overrides: remove special-case KPI value font stack unless it serves a clear brand purpose.

## Interaction & motion

- Keep motion subtle and purposeful:
  - 150–200ms transitions on hover/focus for interactive surfaces.
  - Staggered “dashboard load reveal” can reuse existing `fade-in-up` primitives.
- Respect `prefers-reduced-motion` (already implemented globally).

## Responsive behavior

Mobile-first rules:

- Sidebar remains desktop-first; on smaller widths, the shell should degrade gracefully (future enhancement: collapsible sidebar/drawer).
- Dashboard grid collapses:
  - KPI strip: 4-up → 2-up → 1-up
  - Queues and recents: 2-col → 1-col
- Tables become horizontally scrollable when needed (use existing scrollbar styling patterns).

## Acceptance criteria

- `/` is a **Dashboard** overview (not marketing hero) and feels like the hub of the product.
- All pages look like the same design system:
  - consistent panels/cards, tables, forms, headings, and actions.
- Mint accent remains **sparse and meaningful** (no “everything is green”).
- No functional regressions to Planner, Shipments, Extract, Settings.

## Risks & mitigations

- **Theme drift** (many existing utilities in `globals.css`): avoid breaking changes; introduce new tokens gradually and keep back-compat aliases when needed.
- **Inconsistent page wrappers**: ensure the enterprise shell wraps the dashboard the same way it wraps other pages.
- **Table density regressions**: standardize table typography/padding in one place; avoid per-page overrides.

