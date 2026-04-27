import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/po/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-bold transition-[box-shadow,background-color,border-color,color,filter] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--primary)] bg-[var(--primary)] text-[var(--surface)] hover:brightness-110 hover:shadow-[0_0_20px_rgba(29,158,117,0.35)]",
        accent: "border border-[var(--primary)] bg-[var(--primary)] text-[var(--surface)] hover:brightness-110",
        success:
          "border border-[var(--success)] bg-[var(--success)] text-[var(--surface)] hover:brightness-110 hover:shadow-[0_0_18px_rgba(29,158,117,0.3)]",
        outline:
          "border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--primary)_55%,transparent)] hover:text-[var(--primary)] hover:shadow-[0_0_16px_color-mix(in_srgb,var(--primary)_22%,transparent)]",
        ghost:
          "border border-transparent text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--primary)]",
        destructive:
          "border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_15%,var(--card))] text-[color-mix(in_srgb,var(--danger)_35%,var(--text))] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:shadow-[0_0_16px_color-mix(in_srgb,var(--danger)_22%,transparent)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-10 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-lg px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
