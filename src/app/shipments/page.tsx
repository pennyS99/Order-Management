import Link from "next/link";
import { MapPinned, Package, Route, Truck } from "lucide-react";

import type { SavedShipmentTableRow } from "@/components/planner/ShipmentsSavedPlansTable";
import { readMasters } from "@/lib/mastersStore";
import { buildDcSummaryRows } from "@/lib/planner/dcSummaryRows";
import { searchSavedPlansAcrossAll } from "@/lib/savedPlansStore";
import { ShipmentsHeaderAndStopsClient } from "./ShipmentsHeaderAndStopsClient";

function planIdFromRow(shipmentId: string): string {
  const i = shipmentId.indexOf("::");
  return i >= 0 ? shipmentId.slice(0, i) : "";
}

function bumpCount(map: Map<string, number>, key: string, delta = 1) {
  const k = key.trim() || "—";
  map.set(k, (map.get(k) ?? 0) + delta);
}

function topEntries(map: Map<string, number>, n: number): { label: string; count: number }[] {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

function aggregateShipmentsDashboard(rows: SavedShipmentTableRow[]) {
  const planIds = new Set<string>();
  const shipmentKeys = new Set<string>();
  const truckMap = new Map<string, number>();
  const serviceMap = new Map<string, number>();
  const dcMap = new Map<string, number>();
  const originMap = new Map<string, number>();
  let totalQty = 0;
  let totalKg = 0;
  let totalCbm = 0;
  let stopsWithTimingGap = 0;

  for (const row of rows) {
    const pid = planIdFromRow(row.shipmentId);
    if (pid) planIds.add(pid);
    shipmentKeys.add(row.shipmentId);
    bumpCount(truckMap, row.truckType);
    bumpCount(serviceMap, row.serviceType);
    bumpCount(dcMap, row.dcName);
    bumpCount(originMap, row.origin || "—");
    totalQty += row.totalQty;
    totalKg += row.totalKg;
    totalCbm += row.totalCbm;
    if (row.arriveClock === "—" || row.departClock === "—") stopsWithTimingGap += 1;
  }

  const maxDc = topEntries(dcMap, 1)[0]?.count ?? 1;
  const maxOrigin = topEntries(originMap, 1)[0]?.count ?? 1;
  const maxService = topEntries(serviceMap, 1)[0]?.count ?? 1;

  return {
    planCount: planIds.size,
    routedShipmentCount: shipmentKeys.size,
    stopCount: rows.length,
    totalQty,
    totalKg,
    totalCbm,
    stopsWithTimingGap,
    topDc: topEntries(dcMap, 5),
    topOrigin: topEntries(originMap, 5),
    serviceBreakdown: topEntries(serviceMap, 6),
    truckBreakdown: topEntries(truckMap, 5),
    maxDc,
    maxOrigin,
    maxService,
  };
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
        {subtitle ? (
          <p className="mt-0.5 text-xs leading-snug text-[var(--muted-foreground)]">{subtitle}</p>
        ) : null}
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

export default async function ShipmentsPage() {
  const result = await searchSavedPlansAcrossAll({});
  const masters = await readMasters();
  const channelTypeByDcName = new Map(
    masters.addresses
      .map((a) => [String(a.dcName ?? "").trim(), String(a.channelType ?? "").trim()] as const)
      .filter(([dc]) => Boolean(dc)),
  );

  const rows: SavedShipmentTableRow[] = buildDcSummaryRows(result.shipments).map((r) => {
    const channelType = channelTypeByDcName.get(r.dcName)?.trim() || r.channelType?.trim?.() || "";
    return {
      ...r,
      channelType,
      savedPlanName: result.savedPlanNameByShipmentId[r.shipmentId] ?? "",
    };
  });

  const stats = aggregateShipmentsDashboard(rows);
  const timingPct =
    stats.stopCount === 0 ? 100 : Math.round(((stats.stopCount - stats.stopsWithTimingGap) / stats.stopCount) * 100);

  return (
    <main className="shipments-dashboard mx-auto max-w-[min(100vw-2rem,1680px)] px-4 py-6 md:px-6 md:py-8">
      <ShipmentsHeaderAndStopsClient rows={rows} />

      <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2">
          <DashboardCard title="Plan snapshot" subtitle="Across all saved shipments">
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
            <span className="om-kpi-value">{stats.totalQty.toLocaleString()}</span>
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
            <span className="om-kpi-trend om-kpi-trend--up">
              {stats.stopCount === 0 ? "No stops" : "Arrive & depart both set"}
            </span>
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
          <BarList
            items={stats.serviceBreakdown}
            max={stats.maxService}
            emptyLabel="No service breakdown yet."
          />
        </DashboardCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <DashboardCard title="Capacity roll-up" subtitle="Totals across all stops">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 shrink-0 text-[var(--primary)]" strokeWidth={1.75} aria-hidden />
                <dt className="text-xs text-[var(--muted-foreground)]">Qty</dt>
                <dd className="ml-auto font-semibold tabular-nums text-[var(--text)]">
                  {stats.totalQty.toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 shrink-0 text-[var(--primary)]" strokeWidth={1.75} aria-hidden />
                <dt className="text-xs text-[var(--muted-foreground)]">Kg</dt>
                <dd className="ml-auto font-semibold tabular-nums text-[var(--text)]">
                  {stats.totalKg.toFixed(2)}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <Route className="h-5 w-5 shrink-0 text-[var(--primary)]" strokeWidth={1.75} aria-hidden />
                <dt className="text-xs text-[var(--muted-foreground)]">CBM</dt>
                <dd className="ml-auto font-semibold tabular-nums text-[var(--text)]">
                  {stats.totalCbm.toFixed(2)}
                </dd>
              </div>
            </dl>
          </DashboardCard>
        </div>

        <div className="lg:col-span-4">
          <DashboardCard title="Truck types" subtitle="Stops by equipment">
            <BarList
              items={stats.truckBreakdown}
              max={stats.truckBreakdown[0]?.count ?? 1}
              emptyLabel="No truck data yet."
            />
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
