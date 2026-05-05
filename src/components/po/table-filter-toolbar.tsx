"use client";

type TableFilterToolbarProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function TableFilterToolbar({ id, value, onChange, placeholder = "Filter...", className }: TableFilterToolbarProps) {
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
          "min-w-[180px] max-w-sm flex-1 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-xs text-[#e0e0e0] placeholder:text-[#5c5c5c] transition-colors duration-150 focus:border-[#1D9E75]/70 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/40"
        }
      />
    </>
  );
}
