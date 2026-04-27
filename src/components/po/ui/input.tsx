import * as React from "react";
import { cn } from "@/lib/po/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card-alt)] px-3 py-1.5 text-sm text-[var(--text)] placeholder:text-[#5c5c5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--primary)_45%,transparent)] focus-visible:border-[color-mix(in_srgb,var(--primary)_70%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 transition-[border-color,box-shadow] duration-200",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
