"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Map as MapIcon, MapPinned, Package, Route, Truck } from "lucide-react";

import { ShipmentsSavedPlansTable, type SavedShipmentTableRow } from "@/components/planner/ShipmentsSavedPlansTable";
import { cn } from "@/lib/po/utils";
import { aggregateShipmentsDashboard } from "@/lib/shipments/aggregateShipmentsDashboard";

const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function formatInt(value: number): string {
  return integerFormatter.format(value);
}

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
        "group flex h-10 items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-elevated)] px-2 sm:h-8 sm:rounded-[6px]",
        "shadow-sm",
        "focus-within:border-[color-mix(in_oklch,var(--primary)_55%,var(--border))] focus-within:ring-2 focus-within:ring-[var(--ring)]",
        className,
      )}
      aria-label={label}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
        {label}
      </span>
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
  return (
    <span className={cn("relative flex min-w-0 flex-1 items-center", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-full w-full min-w-0 appearance-none bg-transparent pr-7 text-left",
          "text-[11px] font-semibold text-[var(--text)]",
          "outline-none",
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <ChevronDown
        className="pointer-events-none absolute right-0 h-4 w-4 text-[var(--muted-foreground)]"
        strokeWidth={2}
        aria-hidden
      />
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
        "text-[11px] font-semibold text-[var(--text)]/85",
        "outline-none placeholder:text-[var(--muted-foreground)]/70",
        className,
      )}
    />
  );
}

function DashboardCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-[var(--om-panel-radius)] border-[0.5px] border-[var(--om-border)] bg-[var(--om-surface)] shadow-sm">
      <header className="border-b-[0.5px] border-[var(--om-border)] bg-[var(--om-surface-raised)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs leading-snug text-[var(--muted-foreground)]">{subtitle}</p> : null}
      </header>
      <div className="min-h-0 flex-1 p-4">{children}</div>
    </section>
  );
}

function BarList({
  items,
  max,
  emptyLabel,
}: {
  items: { label: string; count: number }[];
  max: number;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-[var(--muted-foreground)]">{emptyLabel}</p>;
  }
  const denom = Math.max(max, 1);
  return (
    <ul className="space-y-2">
      {items.map(({ label, count }) => (
        <li key={label} className="flex items-center gap-2 text-sm leading-tight">
          <span className="min-w-0 flex-1 truncate font-medium text-[var(--text)]" title={label}>
            {label}
          </span>
          <div className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-[var(--surface-elevated)] ring-1 ring-[var(--border)]">
            <div
              className="h-full rounded-full bg-[color-mix(in_oklch,var(--primary)_78%,var(--surface))]"
              style={{ width: `${Math.round((count / denom) * 100)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--muted-foreground)]">
            {count}
          </span>
        </li>
      ))}
    </ul>
  );
}

function KpiListRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm leading-tight">
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{value}</span>
    </div>
  );
}

export function ShipmentsDashboardClient({ rows }: { rows: SavedShipmentTableRow[] }) {
  const serviceTypes = useMemo(
    () => uniqueSorted(rows.map((r) => String(r.serviceType ?? "").trim()).filter(Boolean)),
    [rows],
  );

  const origins = useMemo(() => uniqueSorted(rows.map((r) => String(r.origin ?? "").trim()).filter(Boolean)), [rows]);

  const channelTypes = useMemo(
    () =>
      uniqueSorted(
        rows.map((r) => String((r as unknown as { channelType?: string }).channelType ?? "").trim()).filter(Boolean),
      ),
    [rows],
  );

  const truckTypes = useMemo(
    () => uniqueSorted(rows.map((r) => String(r.truckType ?? "").trim()).filter(Boolean)),
    [rows],
  );

  const serviceTypeOptions = useMemo(
    () => [{ value: "all", label: "All" }, ...serviceTypes.map((t) => ({ value: t, label: t }))],
    [serviceTypes],
  );
  const originOptions = useMemo(
    () => [{ value: "all", label: "All" }, ...origins.map((o) => ({ value: o, label: o }))],
    [origins],
  );
  const channelTypeOptions = useMemo(
    () => [{ value: "all", label: "All" }, ...channelTypes.map((t) => ({ value: t, label: t }))],
    [channelTypes],
  );
  const truckTypeOptions = useMemo(
    () => [{ value: "all", label: "All" }, ...truckTypes.map((t) => ({ value: t, label: t }))],
    [truckTypes],
  );

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

  const stats = useMemo(() => aggregateShipmentsDashboard(filteredRows), [filteredRows]);
  const timingPct = useMemo(() => {
    if (stats.stopCount === 0) return 100;
    return Math.round(((stats.stopCount - stats.stopsWithTimingGap) / stats.stopCount) * 100);
  }, [stats.stopCount, stats.stopsWithTimingGap]);

  return (
    <main className="shipments-dashboard mx-auto max-w-[min(100vw-2rem,1680px)] px-4 py-6 md:px-6 md:py-8">
      <section className="mb-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="w-full max-w-[980px] space-y-2">
            <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-12">
              <FilterShell label="PLD" className="w-full sm:col-span-3">
                <input
                  type="date"
                  value={pldIso}
                  onChange={(e) => setPldIso(e.target.value)}
                  aria-label="PLD"
                  className="h-full w-full min-w-0 bg-transparent pr-1 text-[11px] font-semibold text-[var(--text)]/85 outline-none"
                />
              </FilterShell>

              <FilterShell label="Service" className="w-full sm:col-span-2">
                <FilterSelect value={serviceType} onChange={setServiceType} options={serviceTypeOptions} />
              </FilterShell>

              <FilterShell label="Origin" className="w-full sm:col-span-2">
                <FilterSelect value={origin} onChange={setOrigin} options={originOptions} />
              </FilterShell>

              <FilterShell label="Channel" className="w-full sm:col-span-2">
                <FilterSelect value={channelType} onChange={setChannelType} options={channelTypeOptions} />
              </FilterShell>

              <FilterShell label="Truck" className="w-full sm:col-span-3">
                <FilterSelect value={truckType} onChange={setTruckType} options={truckTypeOptions} />
              </FilterShell>

              <FilterShell label="DC" className="w-full sm:col-span-4">
                <FilterTextInput value={dcNameQuery} onChange={setDcNameQuery} placeholder="DC name…" />
              </FilterShell>

              <FilterShell label="PO" className="w-full sm:col-span-4">
                <FilterTextInput value={poNumberQuery} onChange={setPoNumberQuery} placeholder="PO number…" />
              </FilterShell>

              <FilterShell label="RAD" className="w-full sm:col-span-3">
                <input
                  type="date"
                  value={radIso}
                  onChange={(e) => setRadIso(e.target.value)}
                  aria-label="RAD"
                  className="h-full w-full min-w-0 bg-transparent pr-1 text-[11px] font-semibold text-[var(--text)]/85 outline-none"
                />
              </FilterShell>

              <div className="grid grid-cols-1 gap-2 sm:col-span-5 sm:grid-cols-2">
                <Link
                  href="/shipments/map"
                  className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[11px] font-semibold text-[var(--text)]/85 transition-colors hover:border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] hover:text-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] sm:h-8 sm:rounded-[6px] sm:px-2"
                >
                  <MapIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  Open map
                </Link>

                {hasAnyFiltersApplied ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[11px] font-semibold text-[var(--text)]/85 hover:border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] sm:h-8 sm:rounded-[6px] sm:px-2"
                  >
                    Clear
                  </button>
                ) : (
                  <span className="hidden sm:block" aria-hidden />
                )}
              </div>
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

      <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2">
          <DashboardCard title="Plan snapshot" subtitle="Across filtered shipments">
            <div className="divide-y divide-[var(--om-border)] rounded-lg border-[0.5px] border-[var(--om-border)] bg-[var(--om-surface-raised)]/30 px-3">
              <KpiListRow label="Saved plans" value={stats.planCount} />
              <KpiListRow label="Routed shipments" value={stats.routedShipmentCount} />
              <KpiListRow label="DC stops" value={stats.stopCount} />
              <KpiListRow label="Stops missing arrive/depart" value={stats.stopsWithTimingGap} />
            </div>
          </DashboardCard>
        </div>

        <div className="grid grid-cols-2 gap-4 md:col-span-2 xl:col-span-2">
          <div className="om-kpi-card">
            <span className="om-kpi-label">Total qty</span>
            <span className="om-kpi-value">{formatInt(stats.totalQty)}</span>
            <span className="om-kpi-trend om-kpi-trend--up">Cases</span>
          </div>
          <div className="om-kpi-card">
            <span className="om-kpi-label">Total kg</span>
            <span className="om-kpi-value">{stats.totalKg.toFixed(0)}</span>
            <span className="om-kpi-trend">Weight</span>
          </div>

          <div className="om-kpi-card col-span-2">
            <span className="om-kpi-label">Schedule coverage</span>
            <span className="om-kpi-value">{timingPct}%</span>
            <span className="om-kpi-trend om-kpi-trend--up">{stats.stopCount === 0 ? "No stops" : "Arrive & depart both set"}</span>
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardCard title="Top DCs" subtitle="By stop count">
          <BarList items={stats.topDc} max={stats.maxDc} emptyLabel="No DC data yet." />
        </DashboardCard>

        <DashboardCard title="Top origins" subtitle="By stop count">
          <BarList items={stats.topOrigin} max={stats.maxOrigin} emptyLabel="No origin data yet." />
        </DashboardCard>

        <DashboardCard title="Service mix" subtitle="Stops by service type">
          <BarList items={stats.serviceBreakdown} max={stats.maxService} emptyLabel="No service breakdown yet." />
        </DashboardCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <DashboardCard title="Capacity roll-up" subtitle="Totals across filtered stops">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 shrink-0 text-[var(--primary)]" strokeWidth={1.75} aria-hidden />
                <dt className="text-xs text-[var(--muted-foreground)]">Qty</dt>
                <dd className="ml-auto font-semibold tabular-nums text-[var(--text)]">{formatInt(stats.totalQty)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 shrink-0 text-[var(--primary)]" strokeWidth={1.75} aria-hidden />
                <dt className="text-xs text-[var(--muted-foreground)]">Kg</dt>
                <dd className="ml-auto font-semibold tabular-nums text-[var(--text)]">{stats.totalKg.toFixed(2)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <Route className="h-5 w-5 shrink-0 text-[var(--primary)]" strokeWidth={1.75} aria-hidden />
                <dt className="text-xs text-[var(--muted-foreground)]">CBM</dt>
                <dd className="ml-auto font-semibold tabular-nums text-[var(--text)]">{stats.totalCbm.toFixed(2)}</dd>
              </div>
            </dl>
          </DashboardCard>
        </div>

        <div className="lg:col-span-4">
          <DashboardCard title="Truck types" subtitle="Stops by equipment">
            <BarList items={stats.truckBreakdown} max={stats.truckBreakdown[0]?.count ?? 1} emptyLabel="No truck data yet." />
          </DashboardCard>
        </div>

        <div className="lg:col-span-4">
          <section className="flex h-full min-h-[200px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
            <header className="border-b border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--text)]">Network map</h2>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Routes and DC pins</p>
            </header>
            <div className="flex flex-1 flex-col justify-between gap-4 p-4">
              <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
                Open the interactive map to review geography, drop order, and OSRM road paths for saved shipments.
              </p>
              <Link
                href="/shipments/map"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition-colors hover:border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] hover:text-[var(--primary)]"
              >
                <MapPinned className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                View shipments map
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

