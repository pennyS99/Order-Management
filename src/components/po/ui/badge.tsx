import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--surface)]",
  {
    variants: {
      variant: {
        default:
          "border-[var(--border)] bg-[var(--card)] text-[var(--text)]",
        secondary:
          "border-[var(--border)] bg-[color-mix(in_oklch,var(--surface-elevated)_75%,transparent)] text-[var(--muted-foreground)]",
        success:
          "border-[color-mix(in_oklch,var(--success)_35%,var(--border))] bg-[color-mix(in_oklch,var(--success)_16%,transparent)] text-[var(--success)]",
        outline: "border-[var(--border)] bg-transparent text-[var(--text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

