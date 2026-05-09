import * as React from "react";

import { cn } from "@/lib/po/utils";
import { Button } from "@/components/po/ui/button";

export type ContinueCard = {
  title: string;
  description: string;
  meta: string;
  cta: string;
  tone?: "default" | "primary";
};

export interface ContinueCardsProps extends React.HTMLAttributes<HTMLDivElement> {
  cards?: ContinueCard[];
}

const DEFAULT_CARDS: ContinueCard[] = [
  {
    title: "Validate extracted fields",
    description: "Review low-confidence lines and confirm the header + totals.",
    meta: "7 docs • 12 mins est.",
    cta: "Continue review",
    tone: "primary",
  },
  {
    title: "Export last batch",
    description: "Download JSON/CSV exports for the most recent successful run.",
    meta: "Batch 2026-05-09 16:58",
    cta: "Open exports",
    tone: "default",
  },
  {
    title: "Supplier mapping",
    description: "Tune aliases and address patterns to improve automatic detection.",
    meta: "3 new aliases suggested",
    cta: "Update mapping",
    tone: "default",
  },
];

function cardToneClasses(tone: ContinueCard["tone"]): string {
  if (tone === "primary") {
    return "border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface))]";
  }
  return "border-[var(--border)] bg-[var(--surface)]";
}

export function ContinueCards({ className, cards = DEFAULT_CARDS, ...props }: ContinueCardsProps) {
  return (
    <section
      aria-label="Continue"
      className={cn("rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4", className)}
      {...props}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-[var(--text)]">Continue</div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">Pick up where you left off.</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className={cn(
              "flex h-full flex-col rounded-2xl border p-4 shadow-[0_0_0_1px_color-mix(in_srgb,var(--border)_40%,transparent)]",
              cardToneClasses(card.tone)
            )}
          >
            <div className="text-sm font-semibold text-[var(--text)]">{card.title}</div>
            <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{card.description}</div>

            <div className="mt-3 text-xs font-semibold text-[var(--muted)]">{card.meta}</div>

            <div className="mt-4">
              <Button type="button" size="sm" variant={card.tone === "primary" ? "default" : "outline"} className="w-full">
                {card.cta}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

