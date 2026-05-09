"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/po/utils";
import { useTheme } from "./theme-context";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-0.5 shadow-sm",
        className,
      )}
      role="group"
      aria-label="Color theme"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={!isDark}
        aria-label="Use light theme"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 ease-out",
          !isDark
            ? "bg-[var(--card)] text-[var(--text)] shadow-[0_1px_2px_oklch(0.145_0.008_265_/_0.08)]"
            : "text-[var(--muted-foreground)] hover:text-[var(--text)]",
        )}
      >
        <Sun className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={isDark}
        aria-label="Use dark theme"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 ease-out",
          isDark
            ? "bg-[var(--card)] text-[var(--text)] shadow-[0_1px_2px_rgb(0_0_0_/_0.35)]"
            : "text-[var(--muted-foreground)] hover:text-[var(--text)]",
        )}
      >
        <Moon className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
