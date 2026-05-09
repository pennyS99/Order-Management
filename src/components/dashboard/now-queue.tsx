import * as React from "react";

import { cn } from "@/lib/po/utils";
import { Button } from "@/components/po/ui/button";

export type QueueItem = {
  id: string;
  title: string;
  subtitle: string;
  status: "waiting" | "processing" | "needs-review";
};

export interface NowQueueProps extends React.HTMLAttributes<HTMLDivElement> {
  items?: QueueItem[];
}

const DEFAULT_ITEMS: QueueItem[] = [
  { id: "Q-1042", title: "HARI HARI – PO 4796310", subtitle: "2 pages • PDF", status: "processing" },
  { id: "Q-1043", title: "PT Example Supplier – PO 99102", subtitle: "1 page • Image", status: "needs-review" },
  { id: "Q-1044", title: "Sinar Sahabat Intim – PO 4801021", subtitle: "3 pages • PDF", status: "waiting" },
];

function statusPill(status: QueueItem["status"]) {
  switch (status) {
    case "processing":
      return {
        label: "Processing",
        className:
          "border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_14%,var(--card))] text-[color-mix(in_srgb,var(--primary)_85%,white)]",
      };
    case "needs-review":
      return {
        label: "Needs review",
        className:
          "border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,var(--card))] text-[color-mix(in_srgb,var(--danger)_75%,white)]",
      };
    default:
      return {
        label: "Waiting",
        className: "border-[var(--border)] bg-[var(--card)] text-[var(--muted)]",
      };
  }
}

export function NowQueue({ className, items = DEFAULT_ITEMS, ...props }: NowQueueProps) {
  return (
    <section
      aria-label="Now queue"
      className={cn(
        "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_0_0_color-mix(in_srgb,var(--border)_55%,transparent)]",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-[var(--text)]">Now queue</div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">What’s currently in-flight or waiting.</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm">
            View all
          </Button>
          <Button type="button" size="sm">
            Add files
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {items.map((item) => {
          const pill = statusPill(item.status);
          return (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--muted)]">{item.id}</span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", pill.className)}>
                    {pill.label}
                  </span>
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-[var(--text)]">{item.title}</div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">{item.subtitle}</div>
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0">
                Details
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

