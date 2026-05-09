import * as React from "react";

import { cn } from "@/lib/po/utils";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { NowQueue } from "@/components/dashboard/now-queue";
import { ContinueCards } from "@/components/dashboard/continue-cards";
import { QuickActions } from "@/components/dashboard/quick-actions";

export interface DashboardPageProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
}

export function DashboardPage({
  className,
  title = "Dashboard",
  subtitle = "Overview of your extraction workflow.",
  ...props
}: DashboardPageProps) {
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-6xl space-y-4 px-4 py-6 sm:space-y-6 sm:px-6",
        className
      )}
      {...props}
    >
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-[var(--text)] sm:text-xl">{title}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
          </div>
          <div className="hidden sm:block">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--muted)]">
              Tip: keep your templates up to date for better auto-detection.
            </div>
          </div>
        </div>
      </header>

      <KpiStrip />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <div className="space-y-4">
          <NowQueue />
          <ContinueCards />
        </div>
        <div className="space-y-4">
          <QuickActions />
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-sm font-bold text-[var(--text)]">System status</div>
            <div className="mt-2 grid gap-2 text-xs text-[var(--muted)]">
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <span>OCR engine</span>
                <span className="font-semibold text-[var(--text)]">Ready</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <span>Extractor rules</span>
                <span className="font-semibold text-[var(--text)]">Loaded</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <span>Last run</span>
                <span className="font-semibold text-[var(--text)]">Just now</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

