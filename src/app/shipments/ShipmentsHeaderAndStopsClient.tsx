"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Map as MapIcon } from "lucide-react";

import { ShipmentsSavedPlansTable, type SavedShipmentTableRow } from "@/components/planner/ShipmentsSavedPlansTable";
import { cn } from "@/lib/po/utils";

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
  );
}

function parseOmDateDdMmmYy(raw: string | undefined): Date | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || v === "—" || v === "mixed") return null;
  const m = /^(\d{2})-([a-z]{3})-(\d{2})$/.exec(v);
  if (!m) return null;
  const day = Number(m[1]);
  const mon = m[2];
  const yy = Number(m[3]);
  const monthByMon: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const month = monthByMon[mon];
  if (month == null || !Number.isFinite(day) || !Number.isFinite(yy)) return null;
  const year = 2000 + yy;
  const dt = new Date(year, month, day);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toDateStart(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateEnd(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function FilterShell({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        // Match `/shipments/map` filter styling (compact, neutral, high-contrast)
        "group flex h-8 items-center gap-2 rounded-[6px] border border-[#333] bg-[#1e1e1e] px-2",
        "shadow-sm",
        "focus-within:border-[#1D9E75]/70 focus-within:ring-2 focus-within:ring-[#1D9E75]/25",
        className,
      )}
      aria-label={label}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#888]">{label}</span>
      {children}
    </label>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    return options.find((o) => o.value === value)?.label ?? options[0]?.label ?? "";
  }, [options, value]);

  useEffect(() => {
    function onDocPointerDown(e: MouseEvent) {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (el.closest("[data-filter-select-root]")) return;
      setIsOpen(false);
    }
    if (!isOpen) return;
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [isOpen]);

  return (
    <span data-filter-select-root className={cn("relative flex min-w-0 flex-1 items-center", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "w-full min-w-0 pr-7 text-left",
          "text-[11px] font-semibold text-[#aaa]",
          "outline-none",
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="block truncate">{selectedLabel}</span>
      </button>

      <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-[#888]" strokeWidth={2} aria-hidden />

      {isOpen ? (
        <div
          role="listbox"
          className={cn(
            "absolute left-0 top-[calc(100%+6px)] z-50 w-full overflow-hidden rounded-[8px] border border-[#333] bg-[#0d0d0d] shadow-lg",
          )}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-2 py-1.5 text-left text-[11px] font-semibold",
                  isSelected ? "bg-[rgba(29,158,117,0.18)] text-[#9ae6c9]" : "text-[#ddd] hover:bg-[#141414]",
                )}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected ? <span className="text-[#1D9E75]">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </span>
  );
}

function FilterTextInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "min-w-0 flex-1 bg-transparent",
        "text-[11px] font-semibold text-[#aaa]",
        "outline-none placeholder:text-[#666]",
        className,
      )}
    />
  );
}

export function ShipmentsHeaderAndStopsClient({ rows }: { rows: SavedShipmentTableRow[] }) {
  const serviceTypes = useMemo(
    () => uniqueSorted(rows.map((r) => String(r.serviceType ?? "").trim()).filter(Boolean)),
    [rows],
  );

  const origins = useMemo(
    () => uniqueSorted(rows.map((r) => String(r.origin ?? "").trim()).filter(Boolean)),
    [rows],
  );

  const channelTypes = useMemo(
    () => uniqueSorted(rows.map((r) => String((r as unknown as { channelType?: string }).channelType ?? "").trim()).filter(Boolean)),
    [rows],
  );

  const truckTypes = useMemo(
    () => uniqueSorted(rows.map((r) => String(r.truckType ?? "").trim()).filter(Boolean)),
    [rows],
  );

  const serviceTypeOptions = useMemo(() => [{ value: "all", label: "All" }, ...serviceTypes.map((t) => ({ value: t, label: t }))], [serviceTypes]);
  const originOptions = useMemo(() => [{ value: "all", label: "All" }, ...origins.map((o) => ({ value: o, label: o }))], [origins]);
  const channelTypeOptions = useMemo(
    () => [{ value: "all", label: "All" }, ...channelTypes.map((t) => ({ value: t, label: t }))],
    [channelTypes],
  );
  const truckTypeOptions = useMemo(() => [{ value: "all", label: "All" }, ...truckTypes.map((t) => ({ value: t, label: t }))], [truckTypes]);

  const [serviceType, setServiceType] = useState<string>("all");
  const [origin, setOrigin] = useState<string>("all");
  const [channelType, setChannelType] = useState<string>("all");
  const [truckType, setTruckType] = useState<string>("all");
  const [dcNameQuery, setDcNameQuery] = useState<string>("");
  const [poNumberQuery, setPoNumberQuery] = useState<string>("");
  const [pldIso, setPldIso] = useState<string>("");
  const [radIso, setRadIso] = useState<string>("");

  const hasAnyFiltersApplied = useMemo(() => {
    const hasBasics =
      serviceType !== "all" ||
      origin !== "all" ||
      channelType !== "all" ||
      truckType !== "all" ||
      dcNameQuery.trim() !== "" ||
      poNumberQuery.trim() !== "";
    return hasBasics || Boolean(pldIso || radIso);
  }, [serviceType, origin, channelType, truckType, dcNameQuery, poNumberQuery, pldIso, radIso]);

  function clearFilters() {
    setServiceType("all");
    setOrigin("all");
    setChannelType("all");
    setTruckType("all");
    setDcNameQuery("");
    setPoNumberQuery("");
    setPldIso("");
    setRadIso("");
  }

  const filteredRows = useMemo(() => {
    const qDc = dcNameQuery.trim().toLowerCase();
    const qPo = poNumberQuery.trim().toLowerCase();
    const pldStart = toDateStart(pldIso || null);
    const pldEnd = toDateEnd(pldIso || null);
    const radStart = toDateStart(radIso || null);
    const radEnd = toDateEnd(radIso || null);

    return rows.filter((r) => {
      if (serviceType !== "all" && String(r.serviceType) !== serviceType) return false;
      if (origin !== "all" && String(r.origin ?? "").trim() !== origin) return false;
      if (channelType !== "all" && String((r as unknown as { channelType?: string }).channelType ?? "").trim() !== channelType) {
        return false;
      }
      if (truckType !== "all" && String(r.truckType ?? "").trim() !== truckType) return false;
      if (qDc && !String(r.dcName ?? "").toLowerCase().includes(qDc)) return false;
      if (qPo && !String((r as unknown as { poNumber?: string }).poNumber ?? "").toLowerCase().includes(qPo)) {
        return false;
      }
      if (pldStart && pldEnd) {
        const d = parseOmDateDdMmmYy(String((r as unknown as { pld?: string }).pld ?? ""));
        if (!d) return false;
        if (d < pldStart) return false;
        if (d > pldEnd) return false;
      }
      if (radStart && radEnd) {
        const d = parseOmDateDdMmmYy(String((r as unknown as { rad?: string }).rad ?? ""));
        if (!d) return false;
        if (d < radStart) return false;
        if (d > radEnd) return false;
      }
      return true;
    });
  }, [rows, serviceType, origin, channelType, truckType, dcNameQuery, poNumberQuery, pldIso, radIso]);

  return (
    <section className="mb-6 space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="w-full max-w-[980px] space-y-2">
          <div className="flex flex-wrap items-stretch gap-2">
            <FilterShell label="PLD" className="min-w-[180px]">
              <input
                type="date"
                value={pldIso}
                onChange={(e) => setPldIso(e.target.value)}
                aria-label="PLD"
                className="[color-scheme:dark] h-8 w-full min-w-0 bg-transparent pr-1 text-[11px] font-semibold text-[#aaa] outline-none"
              />
            </FilterShell>

            <FilterShell label="Service" className="min-w-[180px] flex-1">
              <FilterSelect value={serviceType} onChange={setServiceType} options={serviceTypeOptions} />
          </FilterShell>

            <FilterShell label="Origin" className="min-w-[180px] flex-1">
              <FilterSelect value={origin} onChange={setOrigin} options={originOptions} />
          </FilterShell>

            <FilterShell label="Channel" className="min-w-[180px] flex-1">
              <FilterSelect value={channelType} onChange={setChannelType} options={channelTypeOptions} />
          </FilterShell>

            <FilterShell label="Truck" className="min-w-[180px] flex-1">
              <FilterSelect value={truckType} onChange={setTruckType} options={truckTypeOptions} />
          </FilterShell>

            <FilterShell label="DC" className="min-w-[220px] flex-[1.4]">
            <FilterTextInput value={dcNameQuery} onChange={setDcNameQuery} placeholder="DC name…" />
          </FilterShell>

            <FilterShell label="PO" className="min-w-[220px] flex-[1.4]">
            <FilterTextInput value={poNumberQuery} onChange={setPoNumberQuery} placeholder="PO number…" />
          </FilterShell>

            <FilterShell label="RAD" className="min-w-[180px]">
              <input
                type="date"
                value={radIso}
                onChange={(e) => setRadIso(e.target.value)}
                aria-label="RAD"
                className="[color-scheme:dark] h-8 w-full min-w-0 bg-transparent pr-1 text-[11px] font-semibold text-[#aaa] outline-none"
              />
            </FilterShell>

            <Link
              href="/shipments/map"
              className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-[6px] border border-[#333] bg-[#1e1e1e] px-2 text-[11px] font-semibold text-[#aaa] transition-colors hover:bg-[#202020] hover:text-[#1D9E75] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/25"
            >
              <MapIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              Open map
            </Link>

            {hasAnyFiltersApplied ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-[6px] border border-[#333] bg-[#1e1e1e] px-2 text-[11px] font-semibold text-[#aaa] hover:bg-[#202020] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/25"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <ShipmentsSavedPlansTable
        rows={filteredRows}
        variant="dashboard"
        cardTitle="Stops on the plan"
        cardDescription="Filter and sort like the full table — fewer columns for scan speed."
        tableScrollMaxHeightClass="max-h-[min(52vh,540px)]"
      />
    </section>
  );
}

