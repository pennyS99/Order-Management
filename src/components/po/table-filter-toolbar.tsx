"use client";

type TableFilterToolbarProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function TableFilterToolbar({ id, value, onChange, placeholder = "Search rows...", className }: TableFilterToolbarProps) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Filter rows
      </label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ??
          "min-w-[180px] max-w-sm flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 font-sans text-xs text-[var(--text)] placeholder:text-[var(--om-text-muted)] transition-colors duration-150 focus:border-[color-mix(in_oklch,var(--primary)_55%,var(--border))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--primary)_35%,transparent)]"
        }
      />
    </>
  );
}
