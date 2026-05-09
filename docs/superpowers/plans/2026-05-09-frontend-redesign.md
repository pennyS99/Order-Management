# Frontend Redesign (Ops‑Mintlify) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `/` landing with a Dashboard overview and align the UI across routes to an “Ops‑Mintlify” design language inspired by `DESIGN.md`, without breaking existing functionality.

**Architecture:** Keep the existing enterprise shell (`EnterpriseAppShell` + `EnterpriseSidebar`) as the global layout wrapper. Implement a new dashboard page composed from small presentational components and wire it into navigation. Refine tokens/utilities in `globals.css` to standardize cards/tables/headers while preserving existing back-compat variables.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS v4, existing `src/components/po/ui/*` primitives, CSS variables in `src/app/globals.css`.

---

## Scope check

This plan is a single cohesive redesign effort (dashboard-first + consistent visual language). No independent subsystem splits required.

## File map (create/modify)

**Create**
- `src/components/dashboard/dashboard-page.tsx` (dashboard composition)
- `src/components/dashboard/kpi-strip.tsx` (KPI strip)
- `src/components/dashboard/now-queue.tsx` (jobs/exports queue)
- `src/components/dashboard/continue-cards.tsx` (recents/continue)
- `src/components/dashboard/quick-actions.tsx` (primary actions)

**Modify**
- `src/app/layout.tsx` (wrap all routes with `EnterpriseAppShell`)
- `src/app/page.tsx` (replace landing hero with new dashboard page)
- `src/components/enterprise/nav.ts` (ensure Dashboard entry + correct label/breadcrumb match for `/`)
- `src/app/globals.css` (standardize dashboard card/tile primitives; remove KPI font outlier)

**Verify**
- `npm run lint`
- `npm run test`
- `npm run dev` then verify in browser: `/`, `/planner`, `/shipments`, `/shipments/map`, `/extract`, `/configure`

---

### Task 1: Confirm Next.js App Router conventions (read-only)

**Files:**
- Read: `node_modules/next/dist/docs/` (relevant App Router + CSS guidance)
- Read: `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Read Next.js docs shipped in this repo**

Command:

```bash
ls node_modules/next/dist/docs
```

Expected: directory listing with docs references (use as source of truth for this Next 16 build).

- [ ] **Step 2: Identify any repo-specific routing/layout patterns**

Command:

```bash
ls src/app
```

Expected: confirm existing pages and whether per-route layouts exist.

---

### Task 2: Make enterprise shell the global wrapper

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update root layout to wrap with `EnterpriseAppShell`**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "./providers";
import { EnterpriseAppShell } from "@/components/enterprise/EnterpriseAppShell";

export const metadata: Metadata = {
  title: "Order Management Hub",
  description: "PO PDF extraction and CSV-driven shipment consolidation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark-ops" suppressHydrationWarning>
      <body className="min-h-screen antialiased bg-[var(--surface)] text-[var(--text)]">
        <AppProviders>
          <EnterpriseAppShell>{children}</EnterpriseAppShell>
        </AppProviders>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Run typecheck via Next build**

Command:

```bash
npm run build
```

Expected: build succeeds (or shows compile errors to fix before continuing).

---

### Task 3: Add Dashboard components (new files only)

**Files:**
- Create: `src/components/dashboard/dashboard-page.tsx`
- Create: `src/components/dashboard/kpi-strip.tsx`
- Create: `src/components/dashboard/now-queue.tsx`
- Create: `src/components/dashboard/continue-cards.tsx`
- Create: `src/components/dashboard/quick-actions.tsx`

#### Step 1: Create `src/components/dashboard/kpi-strip.tsx`

- [ ] Create file with:

```tsx
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/po/utils";

type KpiTone = "neutral" | "ok" | "warn" | "err";

export type DashboardKpi = {
  label: string;
  value: string;
  tone?: KpiTone;
  trend?: { direction: "up" | "down"; label: string };
};

function toneClassName(tone: KpiTone | undefined): string {
  switch (tone) {
    case "ok":
      return "border-[color-mix(in_oklch,var(--primary)_28%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_10%,var(--surface))]";
    case "warn":
      return "border-[color-mix(in_oklch,var(--warning)_30%,var(--border))] bg-[color-mix(in_oklch,var(--warning)_10%,var(--surface))]";
    case "err":
      return "border-[color-mix(in_oklch,var(--destructive)_30%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_8%,var(--surface))]";
    case "neutral":
    default:
      return "border-[var(--border)] bg-[var(--surface)]";
  }
}

export function DashboardKpiStrip({ items }: { items: DashboardKpi[] }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((kpi) => (
        <div
          key={kpi.label}
          className={cn(
            "rounded-[12px] border p-4 shadow-[var(--shadow-card)]",
            "transition-colors duration-150",
            toneClassName(kpi.tone),
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-[0.12em] text-[var(--muted-foreground)] uppercase">
                {kpi.label}
              </div>
              <div className="mt-2 truncate text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">
                {kpi.value}
              </div>
            </div>

            {kpi.trend ? (
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold",
                  "border-[var(--border)] bg-[color-mix(in_oklch,var(--surface-elevated)_72%,transparent)] text-[var(--muted-foreground)]",
                )}
              >
                {kpi.trend.direction === "up" ? (
                  <TrendingUp className="h-3.5 w-3.5 text-[var(--primary)]" strokeWidth={2.2} aria-hidden />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-[color-mix(in_oklch,var(--destructive)_85%,#fff)]" strokeWidth={2.2} aria-hidden />
                )}
                <span className="whitespace-nowrap">{kpi.trend.label}</span>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
```

#### Step 2: Create `src/components/dashboard/quick-actions.tsx`

- [ ] Create file with:

```tsx
import Link from "next/link";
import { ArrowUpRight, CalendarDays, FileText, Map, Settings } from "lucide-react";
import { Button } from "@/components/po/ui/button";
import { cn } from "@/lib/po/utils";

type Action = {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  variant?: "default" | "outline";
};

export function DashboardQuickActions({ className }: { className?: string }) {
  const actions: Action[] = [
    {
      title: "New plan",
      description: "Start a routing run from uploaded orders.",
      href: "/planner",
      icon: <CalendarDays className="h-4 w-4" strokeWidth={2} aria-hidden />,
      variant: "default",
    },
    {
      title: "Extract POs",
      description: "Upload PDFs and export line items.",
      href: "/extract",
      icon: <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />,
      variant: "outline",
    },
    {
      title: "Shipments map",
      description: "Spot route density and exceptions.",
      href: "/shipments/map",
      icon: <Map className="h-4 w-4" strokeWidth={2} aria-hidden />,
      variant: "outline",
    },
    {
      title: "Configure masters",
      description: "Warehouses, UOM, and settings.",
      href: "/configure",
      icon: <Settings className="h-4 w-4" strokeWidth={2} aria-hidden />,
      variant: "outline",
    },
  ];

  return (
    <section className={cn("rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-[-0.01em] text-[var(--text)]">Quick actions</div>
          <div className="mt-1 text-xs text-[var(--muted-foreground)]">Jump into the next operational step.</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {actions.map((a) => (
          <div
            key={a.title}
            className="rounded-[12px] border border-[var(--border)] bg-[color-mix(in_oklch,var(--surface-elevated)_65%,transparent)] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <span className="grid h-7 w-7 place-items-center rounded-md border border-[color-mix(in_oklch,var(--primary)_22%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_10%,var(--surface))] text-[var(--primary)]">
                    {a.icon}
                  </span>
                  <span className="truncate">{a.title}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{a.description}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" strokeWidth={2} aria-hidden />
            </div>

            <div className="mt-4">
              <Button asChild variant={a.variant ?? "default"} size="sm" className="rounded-full">
                <Link href={a.href}>Open</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

#### Step 3: Create `src/components/dashboard/now-queue.tsx`

- [ ] Create file with:

```tsx
import Link from "next/link";
import { Clock, FileDown, FileText, Sparkles } from "lucide-react";
import { cn } from "@/lib/po/utils";

type QueueItemTone = "neutral" | "ok" | "warn";

type QueueItem = {
  title: string;
  subtitle: string;
  tone?: QueueItemTone;
  href?: string;
  metaRight?: string;
  icon: React.ReactNode;
};

function toneDotClassName(tone: QueueItemTone | undefined): string {
  switch (tone) {
    case "ok":
      return "bg-[var(--success)]";
    case "warn":
      return "bg-[var(--warning)]";
    case "neutral":
    default:
      return "bg-[color-mix(in_oklch,var(--muted-foreground)_70%,transparent)]";
  }
}

function Row({
  item,
}: {
  item: QueueItem;
}) {
  const content = (
    <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)]">
          {item.icon}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("h-1.5 w-1.5 rounded-full", toneDotClassName(item.tone))} aria-hidden />
            <span className="truncate text-sm font-semibold text-[var(--text)]">{item.title}</span>
          </div>
          <div className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{item.subtitle}</div>
        </div>
      </div>
      <div className="shrink-0 text-xs font-semibold text-[var(--muted-foreground)]">{item.metaRight ?? ""}</div>
    </div>
  );

  return item.href ? (
    <Link href={item.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-[10px]">
      {content}
    </Link>
  ) : (
    content
  );
}

export function DashboardNowQueue({ className }: { className?: string }) {
  const items: QueueItem[] = [
    {
      title: "PO extraction ready",
      subtitle: "Upload PDFs to extract line items for consolidation.",
      tone: "ok",
      href: "/extract",
      metaRight: "2 min",
      icon: <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />,
    },
    {
      title: "Last export",
      subtitle: "Shipment consolidation export is available.",
      tone: "neutral",
      href: "/history",
      metaRight: "Today",
      icon: <FileDown className="h-4 w-4" strokeWidth={2} aria-hidden />,
    },
    {
      title: "Planning window",
      subtitle: "Next dispatch wave starts soon.",
      tone: "warn",
      href: "/planner",
      metaRight: "08:30",
      icon: <Clock className="h-4 w-4" strokeWidth={2} aria-hidden />,
    },
  ];

  return (
    <section className={cn("rounded-[12px] border border-[var(--border)] bg-[color-mix(in_oklch,var(--surface-elevated)_55%,transparent)] p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Sparkles className="h-4 w-4 text-[var(--primary)]" strokeWidth={2} aria-hidden />
            Now
          </div>
          <div className="mt-1 text-xs text-[var(--muted-foreground)]">What needs attention in the next 15 minutes.</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <Row key={item.title} item={item} />
        ))}
      </div>
    </section>
  );
}
```

#### Step 4: Create `src/components/dashboard/continue-cards.tsx`

- [ ] Create file with:

```tsx
import Link from "next/link";
import { ChevronRight, FileText, Truck } from "lucide-react";
import { cn } from "@/lib/po/utils";

type ContinueCard = {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  items: Array<{ label: string; meta: string }>;
};

function Card({ card }: { card: ContinueCard }) {
  return (
    <Link
      href={card.href}
      className={cn(
        "group block rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4",
        "transition-colors duration-150 hover:bg-[color-mix(in_oklch,var(--surface-elevated)_60%,transparent)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <span className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--muted-foreground)] group-hover:text-[var(--text)]">
              {card.icon}
            </span>
            <span className="truncate">{card.title}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{card.description}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted-foreground)] group-hover:text-[var(--text)]" strokeWidth={2} aria-hidden />
      </div>

      <div className="mt-4 space-y-2">
        {card.items.map((i) => (
          <div key={i.label} className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2">
            <div className="truncate text-xs font-semibold text-[var(--text)]">{i.label}</div>
            <div className="shrink-0 text-[11px] font-semibold text-[var(--muted-foreground)]">{i.meta}</div>
          </div>
        ))}
      </div>
    </Link>
  );
}

export function DashboardContinue({ className }: { className?: string }) {
  const cards: ContinueCard[] = [
    {
      title: "Saved plans",
      description: "Return to your latest routing workspaces.",
      href: "/planner/saved",
      icon: <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />,
      items: [
        { label: "Jakarta wave · DC02", meta: "Updated today" },
        { label: "Surabaya refill · DC01", meta: "Yesterday" },
      ],
    },
    {
      title: "Shipments",
      description: "Review recent consolidation runs and exceptions.",
      href: "/shipments",
      icon: <Truck className="h-4 w-4" strokeWidth={2} aria-hidden />,
      items: [
        { label: "Run #1421 · 18 drops", meta: "On time" },
        { label: "Run #1418 · 22 drops", meta: "2 flagged" },
      ],
    },
  ];

  return (
    <section className={cn("rounded-[12px] border border-[var(--border)] bg-[color-mix(in_oklch,var(--surface-elevated)_55%,transparent)] p-4", className)}>
      <div>
        <div className="text-sm font-semibold tracking-[-0.01em] text-[var(--text)]">Continue</div>
        <div className="mt-1 text-xs text-[var(--muted-foreground)]">Pick up where ops left off.</div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {cards.map((card) => (
          <Card key={card.title} card={card} />
        ))}
      </div>
    </section>
  );
}
```

#### Step 5: Create `src/components/dashboard/dashboard-page.tsx`

- [ ] Create file with:

```tsx
import { Button } from "@/components/po/ui/button";
import { DashboardContinue } from "./continue-cards";
import { DashboardKpiStrip, type DashboardKpi } from "./kpi-strip";
import { DashboardNowQueue } from "./now-queue";
import { DashboardQuickActions } from "./quick-actions";

export function DashboardPage() {
  const kpis: DashboardKpi[] = [
    { label: "Today’s shipments", value: "18", tone: "neutral", trend: { direction: "up", label: "+2" } },
    { label: "Late risk", value: "2", tone: "warn", trend: { direction: "down", label: "-1" } },
    { label: "Pending extraction", value: "6", tone: "neutral" },
    { label: "Saved plans", value: "4", tone: "ok", trend: { direction: "up", label: "+1" } },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-2 py-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="text-xs font-semibold tracking-[0.12em] text-[var(--muted-foreground)] uppercase">
            Workspace
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">
            Overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
            Signals, queues, and shortcuts to keep shipments moving without context switching.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-full">
            Download report
          </Button>
          <Button className="rounded-full">Start run</Button>
        </div>
      </header>

      <div className="mt-6 space-y-4">
        <DashboardKpiStrip items={kpis} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <DashboardNowQueue />
          </div>
          <div className="lg:col-span-5">
            <DashboardQuickActions />
          </div>
        </div>

        <DashboardContinue />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Run lint + tests**

Commands:

```bash
npm run lint
npm run test
```

Expected: both succeed. Fix any failures before continuing.

---

### Task 4: Wire the dashboard into `/` route

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace landing hero with Dashboard**

Replace `src/app/page.tsx` with:

```tsx
import { DashboardPage } from "@/components/dashboard/dashboard-page";

export default function Page() {
  return <DashboardPage />;
}
```

- [ ] **Step 2: Run dev server**

Command:

```bash
npm run dev
```

Expected: server starts; dashboard loads at `/` without runtime errors.

---

### Task 5: Update enterprise navigation labels to match dashboard

**Files:**
- Modify: `src/components/enterprise/nav.ts`
- Verify: `EnterpriseAppShell` breadcrumb shows “Workspace → Overview” on `/`

- [ ] **Step 1: Ensure `/` is represented with label “Overview”**

Update `enterpriseNav` to include an entry for `/` under a “Workspace” section (or equivalent existing section), and ensure `matchEnterpriseNavItem("/")` returns the Overview item.

Example shape (adapt to existing file):

```ts
export const enterpriseNav = [
  { section: "Workspace", label: "Overview", href: "/" },
  // existing items...
] as const;
```

- [ ] **Step 2: Verify sidebar active state works on `/`**

Manual check in browser: sidebar highlights Overview when at `/`.

---

### Task 6: Token + utility refinements for consistency

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Remove the KPI value font outlier**

In `.om-kpi-value`, replace the special font stack with the standard UI font:

```css
.om-kpi-value {
  font-family: "Inter", system-ui, sans-serif;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--om-text);
  letter-spacing: -0.02em;
}
```

- [ ] **Step 2: Add a compact “page header” helper class**

Append to `globals.css`:

```css
.om-page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
}

.om-page-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--text);
}

.om-page-subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--muted-foreground);
}
```

- [ ] **Step 3: Run lint after CSS changes**

Command:

```bash
npm run lint
```

Expected: PASS.

---

### Task 7: Browser verification (required)

**Goal:** Verify the redesign is visible and doesn’t break core flows.

- [ ] **Step 1: Verify dashboard**
  - Navigate to `/`
  - Confirm KPI strip, Now, Quick actions, Continue render
  - Confirm no hydration errors

- [ ] **Step 2: Verify core modules still work visually**
  - `/planner` loads and actions render
  - `/shipments` loads
  - `/shipments/map` loads (Leaflet renders)
  - `/extract` loads and upload UI renders
  - `/configure` loads

- [ ] **Step 3: Verify shell behavior**
  - Sidebar highlights correct routes
  - Breadcrumb updates
  - Search pill remains usable (visual-only is fine)

---

## Self-review checklist (run after writing/edits)

- **Spec coverage:** `/` dashboard, global shell consistency, sparse mint, no functional regressions.
- **Placeholder scan:** remove any “TBD/TODO” in plan steps before execution.
- **Type consistency:** ensure imports and component names match exactly across files.

