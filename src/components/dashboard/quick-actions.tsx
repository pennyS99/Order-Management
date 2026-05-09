import * as React from "react";

import { cn } from "@/lib/po/utils";
import { Button } from "@/components/po/ui/button";

export type QuickAction = {
  label: string;
  description: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
};

export interface QuickActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  actions?: QuickAction[];
}

const DEFAULT_ACTIONS: QuickAction[] = [
  { label: "New extraction", description: "Upload files and run OCR + parsing.", variant: "default" },
  { label: "Create template", description: "Define a new supplier mapping preset.", variant: "outline" },
  { label: "Open docs", description: "Review supported formats and guidelines.", variant: "ghost" },
];

export function QuickActions({ className, actions = DEFAULT_ACTIONS, ...props }: QuickActionsProps) {
  return (
    <section
      aria-label="Quick actions"
      className={cn("rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4", className)}
      {...props}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-[var(--text)]">Quick actions</div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">Common things you’ll do often.</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {actions.map((action) => (
          <div
            key={action.label}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_0_0_1px_color-mix(in_srgb,var(--border)_40%,transparent)]"
          >
            <div className="text-sm font-semibold text-[var(--text)]">{action.label}</div>
            <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{action.description}</div>
            <div className="mt-4">
              <Button type="button" size="sm" variant={action.variant ?? "outline"} className="w-full">
                {action.label}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

