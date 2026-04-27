"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function isoFromDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateFromIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const out = new Date(y, mo, d);
  return Number.isNaN(out.getTime()) ? null : out;
}

function monthLabel(year: number, monthIndex: number): string {
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function startWeekday(year: number, monthIndex: number): number {
  // 0=Sun .. 6=Sat
  return new Date(year, monthIndex, 1).getDay();
}

export function PldCalendarPicker({
  value,
  onChange,
  placeholder = "Select PLD",
  buttonClassName,
}: {
  value: string;
  onChange: (nextIso: string) => void;
  placeholder?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const selectedDate = useMemo(() => dateFromIso(value), [value]);
  const now = useMemo(() => new Date(), []);

  const [viewYear, setViewYear] = useState(selectedDate?.getFullYear() ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate?.getMonth() ?? now.getMonth());

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        window.setTimeout(() => btnRef.current?.focus(), 0);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (popoverRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!selectedDate) return;
    setViewYear(selectedDate.getFullYear());
    setViewMonth(selectedDate.getMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const label = selectedDate ? isoFromDate(selectedDate) : "";

  const moveMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const grid = useMemo(() => {
    const start = startWeekday(viewYear, viewMonth);
    const count = daysInMonth(viewYear, viewMonth);
    const cells: Array<{ kind: "empty" } | { kind: "day"; day: number; iso: string }> = [];
    for (let i = 0; i < start; i += 1) cells.push({ kind: "empty" });
    for (let d = 1; d <= count; d += 1) {
      const iso = isoFromDate(new Date(viewYear, viewMonth, d));
      cells.push({ kind: "day", day: d, iso });
    }
    while (cells.length % 7 !== 0) cells.push({ kind: "empty" });
    return cells;
  }, [viewMonth, viewYear]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          buttonClassName ??
          "mt-1 inline-flex w-full min-h-10 items-center justify-between gap-2 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-sm font-semibold text-[#e0e0e0] hover:border-[#1D9E75]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D9E75]/40"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={label ? "tabular-nums" : "text-[#5c5c5c]"}>{label || placeholder}</span>
        <span className="text-[#888888]" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="PLD calendar"
          className="absolute z-50 mt-2 w-[18rem] rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-3 shadow-2xl shadow-black/60"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#141414] text-sm font-black text-[#e0e0e0] hover:border-[#1D9E75]/45 hover:text-[#1D9E75]"
              aria-label="Previous month"
            >
              ‹
            </button>

            <div className="min-w-0 flex-1 text-center text-sm font-black text-[#e0e0e0]">
              {monthLabel(viewYear, viewMonth)}
            </div>

            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#141414] text-sm font-black text-[#e0e0e0] hover:border-[#1D9E75]/45 hover:text-[#1D9E75]"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[#888888]">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {grid.map((cell, idx) => {
              if (cell.kind === "empty") return <div key={`e-${idx}`} className="h-9" />;
              const isSelected = value.trim() === cell.iso;
              const isToday = isoFromDate(new Date()) === cell.iso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => {
                    onChange(cell.iso);
                    setOpen(false);
                    window.setTimeout(() => btnRef.current?.focus(), 0);
                  }}
                  className={
                    "h-9 rounded-lg border text-sm font-semibold tabular-nums transition-colors " +
                    (isSelected
                      ? "border-[#1D9E75]/70 bg-[#1D9E75] text-black"
                      : "border-[#2a2a2a] bg-[#141414] text-[#e0e0e0] hover:border-[#1D9E75]/45 hover:text-[#1D9E75]") +
                    (isToday && !isSelected ? " ring-1 ring-inset ring-[#1D9E75]/25" : "")
                  }
                  aria-pressed={isSelected}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
                window.setTimeout(() => btnRef.current?.focus(), 0);
              }}
              className="inline-flex min-h-9 items-center rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-xs font-semibold text-[#e0e0e0] hover:border-[#1D9E75]/45 hover:text-[#1D9E75]"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(isoFromDate(new Date()));
                setOpen(false);
                window.setTimeout(() => btnRef.current?.focus(), 0);
              }}
              className="inline-flex min-h-9 items-center rounded-lg bg-[#1D9E75] px-3 py-2 text-xs font-black text-black hover:brightness-110"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

