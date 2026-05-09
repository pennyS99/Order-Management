"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/po/ui/button";
import type { Shipment } from "@/types/planner";
import { PldCalendarPicker } from "@/components/planner/PldCalendarPicker";
import { SavedPlansQuickMenu } from "@/components/planner/SavedPlansQuickMenu";
import type { SavedPlansFacets } from "@/lib/savedPlansStore";
import {
  SavedPlansSearchDcTable,
  type SavedPlansSearchRow as SearchRow,
} from "@/components/planner/saved-plans-search-dc-table";

type ByDcListItem = {
  key: string;
  dcName: string;
  poNumbers: string[];
  truckType?: string;
  serviceType?: string;
  pld?: string;
  rad?: string;
};

const PlannerShipmentsOverviewMap = dynamic(
  () => import("./PlannerShipmentsOverviewMap").then((m) => m.PlannerShipmentsOverviewMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(420px,55vh)] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] text-xs font-medium text-[var(--om-text-muted)]">
        Loading map...
      </div>
    ),
  },
);

export function SavedPlansGlobalSearchClient({
  defaultPldIso,
  autoSearchOnMount = false,
  mapHeightClassName,
  tableMaxHeightClassName,
  layout = "inline",
  frame = "card",
}: {
  defaultPldIso?: string;
  autoSearchOnMount?: boolean;
  mapHeightClassName?: string;
  tableMaxHeightClassName?: string;
  layout?: "inline" | "sidebar" | "gmaps";
  frame?: "card" | "none";
}) {
  const [pld, setPld] = useState(defaultPldIso ?? "");
  const [area, setArea] = useState("");
  const [truckType, setTruckType] = useState("");
  const [origin, setOrigin] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [facets, setFacets] = useState<SavedPlansFacets | null>(null);
  const [facetsError, setFacetsError] = useState<string | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [dcCoordinates, setDcCoordinates] = useState<Array<{ dcName: string; lat: number; lng: number }>>([]);
  const [selectedDcName, setSelectedDcName] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/planner/saved-plans/facets", { method: "GET" });
        const json = (await res.json().catch(() => ({}))) as { facets?: SavedPlansFacets; error?: string };
        if (!res.ok || !json.facets) throw new Error(json.error || "Failed to load filter values.");
        if (cancelled) return;
        setFacets(json.facets);
        setFacetsError(null);
      } catch (e) {
        if (cancelled) return;
        setFacetsError(e instanceof Error ? e.message : "Failed to load filter values.");
        setFacets(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dcCoordMap = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const c of dcCoordinates) m.set(c.dcName, { lat: c.lat, lng: c.lng });
    return m;
  }, [dcCoordinates]);

  const byDcList = useMemo<ByDcListItem[]>(() => {
    const by = new Map<string, ByDcListItem>();
    for (const r of rows) {
      const existing = by.get(r.dcName);
      if (!existing) {
        by.set(r.dcName, {
          key: r.dcName,
          dcName: r.dcName,
          poNumbers: r.poNumber ? [r.poNumber] : [],
          truckType: r.truckType,
          serviceType: r.serviceType,
          pld: r.pld,
          rad: r.rad,
        });
      } else if (r.poNumber && !existing.poNumbers.includes(r.poNumber)) {
        existing.poNumbers.push(r.poNumber);
      }
    }
    return Array.from(by.values()).sort((a, b) => a.dcName.localeCompare(b.dcName));
  }, [rows]);

  const runSearch = async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const res = await fetch("/api/planner/saved-plans/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pld: pld.trim() || undefined,
          area: area.trim() || undefined,
          truckType: truckType.trim() || undefined,
          origin: origin.trim() || undefined,
          serviceType: serviceType.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        shipments?: Shipment[];
        dcCoordinates?: Array<{ dcName: string; lat: number; lng: number }>;
        rows?: SearchRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Search failed.");
      setShipments(json.shipments ?? []);
      setDcCoordinates(json.dcCoordinates ?? []);
      setRows(json.rows ?? []);
      setSelectedDcName(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!autoSearchOnMount) return;
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clear = () => {
    setPld("");
    setArea("");
    setTruckType("");
    setOrigin("");
    setServiceType("");
    setShipments([]);
    setRows([]);
    setDcCoordinates([]);
    setError(null);
    setHasSearched(false);
    setSelectedDcName(null);
  };

  const filtersUi = (
    <div className="grid grid-cols-2 gap-1">
      <div className="col-span-1">
        <PldCalendarPicker
          value={pld}
          onChange={setPld}
          placeholder="PLD"
          buttonClassName="inline-flex h-8 w-full items-center justify-between rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[11px] font-semibold text-[var(--om-text-muted)] hover:bg-[var(--surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--primary)_35%,transparent)]"
        />
      </div>
      <div className="col-span-1">
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="h-8 w-full rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[11px] font-semibold text-[var(--om-text-muted)]"
        >
          <option value="">Area</option>
          {(facets?.areas ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-1">
        <select
          value={truckType}
          onChange={(e) => setTruckType(e.target.value)}
          className="h-8 w-full rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[11px] font-semibold text-[var(--om-text-muted)]"
        >
          <option value="">Truck</option>
          {(facets?.truckTypes ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-1">
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="h-8 w-full rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[11px] font-semibold text-[var(--om-text-muted)]"
        >
          <option value="">Origin</option>
          {(facets?.origins ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <select
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value)}
          className="h-8 w-full rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[11px] font-semibold text-[var(--om-text-muted)]"
        >
          <option value="">Service</option>
          {(facets?.serviceTypes ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const filtersMessagesUi = (
    <>
      {facetsError && (
        <p
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200/90"
          role="status"
        >
          {facetsError}
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-[color-mix(in_oklch,var(--destructive)_35%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_8%,var(--card))] px-3 py-2 text-sm text-[var(--destructive)]" role="alert">
          {error}
        </p>
      )}
    </>
  );

  const filtersActionsUi = (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={clear} disabled={loading}>
          Clear
        </Button>
        <Button onClick={runSearch} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </Button>
      </div>

      {hasSearched && (
        <p className="text-xs font-semibold text-[var(--om-text-muted)]" role="status">
          {rows.length} row{rows.length === 1 ? "" : "s"} matched
        </p>
      )}
    </>
  );

  const resultsUi = (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-inner shadow-black/30">
        <div className="border-b border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2.5">
          <h3 className="text-sm font-bold text-[var(--text)]">Map</h3>
        </div>
        <div className="p-3 sm:p-4">
          <PlannerShipmentsOverviewMap shipments={shipments} dcCoordMap={dcCoordMap} mapHeightClassName={mapHeightClassName} />
        </div>
      </div>

      <SavedPlansSearchDcTable rows={rows} tableMaxHeightClassName={tableMaxHeightClassName} />
    </div>
  );

  if (layout === "gmaps") {
    const activeCount = hasSearched ? byDcList.length : 0;
    const subtitle = "Saved route plans";

    const scrollToDc = (dcName: string) => {
      const el = rowRefs.current[dcName];
      if (!el) return;
      try {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch {
        // ignore
      }
    };

    return (
      <section
        className={
          frame === "none"
            ? "relative"
            : "relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]"
        }
      >
        {/* Map canvas */}
        <div className={`relative ${mapHeightClassName ?? "h-[calc(100vh-112px)]"} w-full`}>
          <PlannerShipmentsOverviewMap
            shipments={shipments}
            dcCoordMap={dcCoordMap}
            mapHeightClassName="h-full"
            edgeToEdge
            showRouteStatus={false}
            focusDcName={selectedDcName}
            selectedDcName={selectedDcName}
            onDcMarkerClick={(dcName) => {
              setSelectedDcName(dcName);
              scrollToDc(dcName);
            }}
          />

          {/* Top-right: one minimal floating button only */}
          <div className="pointer-events-none absolute right-3 top-3 z-20">
            <div className="pointer-events-auto">
              <SavedPlansQuickMenu />
            </div>
          </div>

          {/* Left sidebar — unified panel */}
          <aside
            className={
              "absolute left-0 top-0 z-10 h-full w-[320px] border-r border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_96%,var(--text))] backdrop-blur-md transition-transform duration-200 ease-in-out " +
              (sidebarOpen ? "translate-x-0" : "-translate-x-full")
            }
          >
            <div className="flex h-full flex-col">
              {/* Section 1 — Header */}
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-[var(--text)]">Shipments</p>
                  <p className="truncate text-[12px] text-[var(--om-text-muted)]">{subtitle}</p>
                </div>
                {hasSearched && (
                  <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-[var(--primary)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary-foreground)]">
                    {activeCount}
                  </span>
                )}
              </div>

              {/* Section 2 — Filters */}
              <div className="border-b border-[var(--border)] px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--om-text-muted)]">FILTERS</div>
                <div className="mt-2">{filtersUi}</div>
                {(facetsError || error) && (
                  <div className="mt-2 space-y-1.5">
                    {facetsError && <p className="text-[11px] text-amber-200/80">{facetsError}</p>}
                    {error && <p className="text-[11px] text-[var(--destructive)]">{error}</p>}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={clear}
                    disabled={loading}
                    className="rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-[11px] font-semibold text-[var(--om-text-muted)] disabled:opacity-60"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => void runSearch()}
                    disabled={loading}
                    className="rounded-[6px] bg-[var(--primary)] px-2 py-1 text-[11px] font-black text-[var(--primary-foreground)] disabled:opacity-70"
                  >
                    {loading ? "Searching..." : "Search"}
                  </button>
                </div>
              </div>

              {/* Section 3 — Results list */}
              <div className="min-h-0 flex-1 overflow-auto">
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase text-[var(--om-text-muted)]">
                  DC stops · {hasSearched ? `${activeCount} results` : "none yet"}
                </div>

                {!hasSearched ? (
                  <div className="px-3 py-3 text-[12px] text-[var(--om-text-muted)]">Choose filters, then search saved plans.</div>
                ) : byDcList.length === 0 ? (
                  <div className="px-3 py-3 text-[12px] text-[var(--om-text-muted)]">No matches for the current filters.</div>
                ) : (
                  <div>
                    {byDcList.map((item) => {
                      const active = selectedDcName === item.dcName;
                      const extra = item.poNumbers.length > 1 ? ` +${item.poNumbers.length - 1} more` : "";
                      const poLine = item.poNumbers.length > 0 ? `${item.poNumbers[0]}${extra}` : "No PO";
                      return (
                        <div
                          key={item.key}
                          ref={(el) => {
                            rowRefs.current[item.dcName] = el;
                          }}
                          onClick={() => setSelectedDcName(item.dcName)}
                          className={
                            "cursor-pointer border-b border-[var(--border)] px-3 py-2.5 " +
                            (active
                              ? "bg-[color-mix(in_oklch,var(--primary)_11%,var(--card))] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_30%,var(--border))]"
                              : "hover:bg-[var(--surface-elevated)]")
                          }
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedDcName(item.dcName);
                            }
                          }}
                        >
                          <div className="text-[12px] font-medium text-[var(--text)]">{item.dcName}</div>
                          <div className="mt-0.5 text-[11px] text-[var(--om-text-muted)]">{poLine}</div>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--om-text-muted)]">
                            {item.truckType && (
                              <span className="inline-flex items-center rounded-full bg-[color-mix(in_oklch,var(--primary)_16%,var(--card))] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]">
                                {item.truckType}
                              </span>
                            )}
                            <span className="truncate">
                              {item.pld ?? "-"} to {item.rad ?? "-"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 4 — Collapse tab */}
              <div
                className="cursor-pointer border-t border-[var(--border)] px-3 py-2 text-[11px] text-[var(--om-text-muted)]"
                onClick={() => setSidebarOpen(false)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSidebarOpen(false);
                  }
                }}
              >
                Collapse
              </div>
            </div>
          </aside>

          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="absolute left-0 top-24 z-20 rounded-r-lg border border-[var(--border-strong)] bg-[color-mix(in_oklch,var(--card)_94%,var(--text))] px-2 py-2 text-[11px] font-semibold text-[var(--om-text-muted)] shadow-lg shadow-black/10 backdrop-blur-md"
              aria-label="Expand sidebar"
              title="Expand filters"
            >
              Open
            </button>
          )}
        </div>
      </section>
    );
  }

  if (layout === "sidebar") {
    return (
      <section className="relative">
        <div className="flex items-start justify-center gap-4">
          {/* Sidebar (collapsible) */}
          <div
            className={
              "hidden lg:block transition-[width,opacity] duration-200 " +
              (sidebarOpen ? "w-[320px] opacity-100" : "w-0 opacity-0")
            }
            aria-hidden={!sidebarOpen}
          >
            <aside className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 lg:sticky lg:top-24 lg:self-start">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--om-text-muted)]">Filters</p>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="inline-flex min-h-8 items-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 text-xs font-semibold text-[var(--text)] hover:border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] hover:text-[var(--primary)]"
                >
                  Collapse
                </button>
              </div>
              {filtersUi}
              <div className="mt-3 space-y-2">
                {filtersMessagesUi}
                {filtersActionsUi}
              </div>
            </aside>
          </div>

          {/* Main centered column */}
          <div className="w-full max-w-5xl">
            <div className="flex justify-end pb-2 lg:hidden">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex min-h-9 items-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text)] hover:border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] hover:text-[var(--primary)]"
              >
                Filters
              </button>
            </div>

            {!hasSearched ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--om-text-muted)]">
                Choose filters, then search saved plans.
              </div>
            ) : (
              resultsUi
            )}
          </div>

          {/* Collapsed sidebar opener (desktop) */}
          {!sidebarOpen && (
            <div className="hidden lg:flex w-10 justify-start">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="mt-2 inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] text-xs font-black text-[var(--text)] hover:border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] hover:text-[var(--primary)]"
                aria-label="Expand filters"
                title="Expand filters"
              >
                Open
              </button>
            </div>
          )}
        </div>

        {/* Mobile overlay sidebar */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-[var(--card)]/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)}>
            <div
              className="absolute left-0 top-0 h-full w-[min(92vw,360px)] overflow-auto border-r border-[var(--border)] bg-[var(--card)] p-4"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Filters"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--om-text-muted)]">Filters</p>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] text-xs font-semibold text-[var(--text)]"
                  aria-label="Close filters"
                >
                  X
                </button>
              </div>
              {filtersUi}
              <div className="mt-3 space-y-2">
                {filtersMessagesUi}
                {filtersActionsUi}
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="grid gap-4">
        {filtersUi}
        {filtersMessagesUi}
        {filtersActionsUi}
        {hasSearched && resultsUi}
      </div>
    </section>
  );
}

