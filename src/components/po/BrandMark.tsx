import { cn } from "@/lib/po/utils";

interface BrandMarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function BrandMark({ size = "md", className }: BrandMarkProps) {
  const sizeClass =
    size === "sm"
      ? "h-8 w-8 min-h-8 min-w-8"
      : size === "lg"
        ? "h-20 w-20 min-h-20 min-w-20"
        : "h-10 w-10 min-h-10 min-w-10";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_85%,#0f172a_15%)] text-[var(--text)] shadow-[0_8px_24px_rgba(2,6,23,0.3)] transition-[box-shadow,transform,border-color] duration-300",
        sizeClass,
        className
      )}
      aria-label="Order Management Hub logo"
    >
      <svg
        aria-hidden
        viewBox="0 0 36 36"
        className="h-[72%] w-[72%]"
        fill="none"
      >
        <path
          d="M18 4.5C13.86 4.5 10.5 7.86 10.5 12C10.5 17.79 18 26.25 18 26.25C18 26.25 25.5 17.79 25.5 12C25.5 7.86 22.14 4.5 18 4.5Z"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="18" cy="12" r="2.6" fill="currentColor" />
        <path
          d="M7 30.5C11 27.5 15.5 28 18.2 30.2C21.4 32.8 25.6 32.1 29 29.2"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
        <circle cx="6.7" cy="30.5" r="1.4" fill="currentColor" opacity="0.85" />
        <circle cx="29.3" cy="29.2" r="1.4" fill="currentColor" opacity="0.85" />
      </svg>
    </div>
  );
}
