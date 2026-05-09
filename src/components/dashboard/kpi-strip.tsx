import * as React from "react";

import { cn } from "@/lib/po/utils";

export type Kpi = {
  label: string;
  value: string;
  caption?: string;
  tone?: "neutral" | "positive" | "negative";
};

export interface KpiStripProps extends React.HTMLAttributes<HTMLDivElement> {
  kpis?: Kpi[];
}

const DEFAULT_KPIS: Kpi[] = [
  { label: "Processed today", value: "24", caption: "Across 3 suppliers", tone: "positive" },
  { label: "In review", value: "7", caption: "Needs validation", tone: "neutral" },
  { label: "Failed", value: "1", caption: "Retry recommended", tone: "negative" },
  { label: "Avg. time", value: "1m 12s", caption: "Per document", tone: "neutral" },
];

function toneClasses(tone: Kpi["tone"]): string {
  switch (tone) {
    case "positive":
      return "border-[color-mix(in_srgb,var(--success)_45%,var(--border))] bg-[color-mix(in_srgb,var(--success)_10%,var(--card))] text-[var(--text)]";
    case "negative":
      return "border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,var(--card))] text-[var(--text)]";
    default:
      return "border-[var(--border)] bg-[var(--card)] text-[var(--text)]";
  }
}

export function KpiStrip({ className, kpis = DEFAULT_KPIS, ...props }: KpiStripProps) {
  return (
    <section
      aria-label="Key performance indicators"
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-4",
        className
      )}
      {...props}
    >
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className={cn(
            "rounded-xl border p-4 shadow-[0_0_0_1px_color-mix(in_srgb,var(--border)_45%,transparent)]",
            toneClasses(kpi.tone)
          )}
        >
          <div className="text-xs font-semibold text-[var(--muted)]">{kpi.label}</div>
          <div className="mt-1 text-2xl font-bold tracking-tight">{kpi.value}</div>
          {kpi.caption ? (
            <div className="mt-1 text-xs text-[var(--muted)]">{kpi.caption}</div>
          ) : null}
        </div>
      ))}
    </section>
  );
}

