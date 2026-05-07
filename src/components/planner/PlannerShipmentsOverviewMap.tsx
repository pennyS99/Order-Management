"use client";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Shipment } from "@/types/planner";

import "leaflet/dist/leaflet.css";

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

const MAX_CONCURRENT_OSRM_REQUESTS = 4;
let activeOsrmRequests = 0;
const osrmWaitQueue: Array<() => void> = [];

async function acquireOsrmSlot(): Promise<void> {
  if (activeOsrmRequests < MAX_CONCURRENT_OSRM_REQUESTS) {
    activeOsrmRequests += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    osrmWaitQueue.push(() => {
      activeOsrmRequests += 1;
      resolve();
    });
  });
}

function releaseOsrmSlot() {
  activeOsrmRequests = Math.max(0, activeOsrmRequests - 1);
  const next = osrmWaitQueue.shift();
  if (next) next();
}

/** Distinct colors per shipment (line + numbered pin). Cycles if there are more shipments than entries. */
const ROUTE_PALETTE = [
  "oklch(0.67 0.15 260)",
  "oklch(0.69 0.14 160)",
  "oklch(0.72 0.14 75)",
  "oklch(0.66 0.16 300)",
  "oklch(0.69 0.16 10)",
  "oklch(0.70 0.12 220)",
  "oklch(0.66 0.16 250)",
  "oklch(0.72 0.16 45)",
  "oklch(0.66 0.13 190)",
  "oklch(0.70 0.14 85)",
  "oklch(0.66 0.18 320)",
  "oklch(0.66 0.17 20)",
  "oklch(0.67 0.12 235)",
  "oklch(0.73 0.14 135)",
  "oklch(0.70 0.16 55)",
  "oklch(0.66 0.17 285)",
  "oklch(0.63 0.18 25)",
  "oklch(0.67 0.12 210)",
  "oklch(0.68 0.14 155)",
  "oklch(0.71 0.14 92)",
];

function routeColor(shipmentIndex: number): string {
  return ROUTE_PALETTE[shipmentIndex % ROUTE_PALETTE.length];
}

function createDropSequenceIcon(sequence: number, color: string): L.DivIcon {
  const label = String(sequence);
  const size = label.length > 1 ? 30 : 26;
  const fontSize = label.length > 2 ? 10 : 12;
  const inner = `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:999px;background:${color};color:var(--primary-foreground);font-weight:700;font-size:${fontSize}px;font-family:var(--font-sans,system-ui,sans-serif);border:2px solid color-mix(in_oklch,var(--surface)_70%,transparent);box-shadow:0 1px 4px color-mix(in_oklch,var(--background)_55%,transparent);line-height:1;">${label}</div>`;
  return L.divIcon({
    className: "om-leaflet-drop-seq",
    html: inner,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

type DcCoordMap = Map<string, { lat: number; lng: number }>;

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{
    geometry?: {
      coordinates?: [number, number][];
    };
  }>;
}

type RouteState =
  | "loading"
  | { kind: "ok"; latLngs: [number, number][] }
  | { kind: "error"; message: string }
  | { kind: "skipped" };

type LoadedRouteState = { kind: "ok"; latLngs: [number, number][] } | { kind: "error"; message: string };
type FetchedRouteState = { coordPath: string; state: LoadedRouteState };

const routeCacheByCoordPath = new Map<string, LoadedRouteState>();
const inFlightRouteFetchByCoordPath = new Map<
  string,
  Promise<LoadedRouteState>
>();

async function fetchOsrmRoute(coordPath: string): Promise<LoadedRouteState> {
  const cached = routeCacheByCoordPath.get(coordPath);
  if (cached) return cached;

  const inFlight = inFlightRouteFetchByCoordPath.get(coordPath);
  if (inFlight) return inFlight;

  const fetchPromise = (async () => {
    const url = `${OSRM_BASE}/${coordPath}?overview=full&geometries=geojson`;
    try {
      await acquireOsrmSlot();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as OsrmRouteResponse;
      if (data.code !== "Ok") throw new Error("No route");
      const coords = data.routes?.[0]?.geometry?.coordinates;
      if (!coords?.length) throw new Error("Empty geometry");
      const latLngs: [number, number][] = coords.map(([lon, lat]) => [lat, lon]);
      return { kind: "ok" as const, latLngs };
    } catch {
      return {
        kind: "error" as const,
        message: "Road route could not be loaded from OSRM.",
      };
    } finally {
      releaseOsrmSlot();
      inFlightRouteFetchByCoordPath.delete(coordPath);
    }
  })();

  inFlightRouteFetchByCoordPath.set(coordPath, fetchPromise);
  const resolved = await fetchPromise;
  routeCacheByCoordPath.set(coordPath, resolved);
  return resolved;
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    let cancelled = false;

    map.whenReady(() => {
      if (cancelled) return;
      const container = map.getContainer?.();
      const mapPane = (map as unknown as { _mapPane?: HTMLElement })._mapPane;
      if (!container || !container.isConnected || !mapPane) return;

      try {
        if (positions.length === 1) {
          map.setView(positions[0], 12, { animate: false });
          return;
        }
        map.fitBounds(L.latLngBounds(positions), {
          padding: [48, 48],
          maxZoom: 12,
          animate: false,
        });
      } catch {
        // Leaflet can throw during rapid mount/unmount; ignore stale pan attempts.
      }
    });

    return () => {
      cancelled = true;
    };
  }, [map, positions]);
  return null;
}

function FocusDc({
  dcCoordMap,
  focusDcName,
}: {
  dcCoordMap: DcCoordMap;
  focusDcName?: string | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focusDcName) return;
    const c = dcCoordMap.get(focusDcName);
    if (!c) return;
    try {
      map.flyTo([c.lat, c.lng], Math.max(map.getZoom(), 11), { duration: 0.6 });
    } catch {
      // ignore stale map pan attempts
    }
  }, [dcCoordMap, focusDcName, map]);
  return null;
}

export interface PlannerShipmentsOverviewMapProps {
  shipments: Shipment[];
  dcCoordMap: DcCoordMap;
  mapHeightClassName?: string;
  edgeToEdge?: boolean;
  showRouteStatus?: boolean;
  focusDcName?: string | null;
  selectedDcName?: string | null;
  onDcMarkerClick?: (dcName: string) => void;
}

export function PlannerShipmentsOverviewMap({
  shipments,
  dcCoordMap,
  mapHeightClassName,
  edgeToEdge = false,
  showRouteStatus = true,
  focusDcName,
  selectedDcName,
  onDcMarkerClick,
}: PlannerShipmentsOverviewMapProps) {
  const [fetchedRoutesById, setFetchedRoutesById] = useState<Record<string, FetchedRouteState>>({});

  const markers = useMemo(() => {
    const out: Array<{
      key: string;
      shipmentId: string;
      shipmentIndex: number;
      truckType: string;
      sequence: number;
      dcName: string;
      lat: number;
      lng: number;
    }> = [];
    shipments.forEach((shipment, shipmentIndex) => {
      shipment.drops.forEach((dcName, index) => {
        const c = dcCoordMap.get(dcName);
        if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return;
        out.push({
          key: `${shipment.id}-${dcName}-${index + 1}`,
          shipmentId: shipment.id,
          shipmentIndex,
          truckType: shipment.truckType,
          sequence: index + 1,
          dcName,
          lat: c.lat,
          lng: c.lng,
        });
      });
    });
    return out;
  }, [shipments, dcCoordMap]);

  const uniqueDcMarkers = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ dcName: string; lat: number; lng: number }> = [];
    for (const m of markers) {
      if (seen.has(m.dcName)) continue;
      seen.add(m.dcName);
      out.push({ dcName: m.dcName, lat: m.lat, lng: m.lng });
    }
    return out;
  }, [markers]);

  const markerIconsByKey = useMemo(() => {
    const icons = new Map<string, L.DivIcon>();
    for (const m of markers) {
      icons.set(m.key, createDropSequenceIcon(m.sequence, routeColor(m.shipmentIndex)));
    }
    return icons;
  }, [markers]);

  const legDistanceLabels = useMemo(() => {
    const labels: Array<{
      key: string;
      shipmentId: string;
      midpoint: [number, number];
      km: number;
    }> = [];
    for (const shipment of shipments) {
      if (shipment.drops.length < 2) continue;
      const coordByDc = new Map<string, { lat: number; lng: number }>();
      for (const dcName of shipment.drops) {
        const coord = dcCoordMap.get(dcName);
        if (coord) coordByDc.set(dcName, coord);
      }
      for (const stop of shipment.dropStops) {
        if (stop.previousDcName == null || stop.legFromPreviousKm == null) continue;
        const from = coordByDc.get(stop.previousDcName);
        const to = coordByDc.get(stop.dcName);
        if (!from || !to) continue;
        labels.push({
          key: `${shipment.id}-${stop.sequence}`,
          shipmentId: shipment.id,
          midpoint: [(from.lat + to.lat) / 2, (from.lng + to.lng) / 2],
          km: stop.legFromPreviousKm,
        });
      }
    }
    return labels;
  }, [shipments, dcCoordMap]);

  const routePlan = useMemo(() => {
    const nextRoutes: Record<string, RouteState> = {};
    const toFetch: { id: string; coordPath: string }[] = [];

    for (const shipment of shipments) {
      const waypoints = shipment.drops
        .map((dc) => dcCoordMap.get(dc))
        .filter(
          (c): c is { lat: number; lng: number } =>
            c != null && Number.isFinite(c.lat) && Number.isFinite(c.lng),
        );
      const allCoords = waypoints.length === shipment.drops.length && shipment.drops.length > 0;

      if (waypoints.length < 2 || !allCoords) {
        nextRoutes[shipment.id] = { kind: "skipped" };
        continue;
      }

      const coordPath = waypoints.map((w) => `${w.lng},${w.lat}`).join(";");
      const cached = routeCacheByCoordPath.get(coordPath);
      if (cached) {
        nextRoutes[shipment.id] = cached;
      } else if (fetchedRoutesById[shipment.id]?.coordPath === coordPath) {
        nextRoutes[shipment.id] = fetchedRoutesById[shipment.id].state;
      } else {
        nextRoutes[shipment.id] = "loading";
        toFetch.push({ id: shipment.id, coordPath });
      }
    }

    return { routesById: nextRoutes, toFetch };
  }, [shipments, dcCoordMap, fetchedRoutesById]);

  const { routesById, toFetch } = routePlan;

  useEffect(() => {
    let cancelled = false;

    if (toFetch.length > 0) {
      void (async () => {
        const coordPathById = new Map(toFetch.map((t) => [t.id, t.coordPath] as const));
        const results = await Promise.all(
          toFetch.map(async ({ id, coordPath }) => {
              const state = await fetchOsrmRoute(coordPath);
              return [id, state] as const;
          }),
        );
        if (cancelled) return;
        setFetchedRoutesById((prev) => {
          const merged = { ...prev };
          for (const [id, state] of results) {
            const coordPath = coordPathById.get(id);
            if (coordPath) merged[id] = { coordPath, state };
          }
          return merged;
        });
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [toFetch]);

  const fitPoints = useMemo(() => {
    const pts: [number, number][] = markers.map((m) => [m.lat, m.lng]);
    for (const r of Object.values(routesById)) {
      if (typeof r === "object" && r.kind === "ok" && r.latLngs.length > 0) {
        pts.push(...r.latLngs);
      }
    }
    return pts;
  }, [markers, routesById]);

  const anyLoading = Object.values(routesById).some((r) => r === "loading");
  const routeErrors = Object.entries(routesById).filter(
    (e): e is [string, { kind: "error"; message: string }] =>
      typeof e[1] === "object" && e[1].kind === "error",
  );

  const missingSummary = useMemo(() => {
    const lines: string[] = [];
    for (const shipment of shipments) {
      const missing = shipment.drops.filter((dc) => !dcCoordMap.has(dc));
      if (missing.length > 0) {
        lines.push(`${shipment.id}: ${missing.join(", ")}`);
      }
    }
    return lines;
  }, [shipments, dcCoordMap]);

  if (shipments.length === 0) {
    return <p className="text-xs text-slate-500">No shipments.</p>;
  }

  if (markers.length === 0) {
    return (
      <p className="text-xs text-amber-700/90">Add DC coordinates in address master.</p>
    );
  }

  const center = fitPoints[0] ?? [-2.5, 118];
  const isFillHeight = mapHeightClassName === "h-full";

  return (
    <div className={isFillHeight ? "flex h-full min-h-0 flex-col gap-2" : "space-y-2"}>
      {showRouteStatus && missingSummary.length > 0 && (
        <p className="text-xs text-amber-700/90">Missing coords: {missingSummary.join(" · ")}</p>
      )}
      {showRouteStatus && anyLoading && (
        <p className="text-xs text-slate-500">Loading routes…</p>
      )}
      {showRouteStatus && routeErrors.length > 0 && (
        <p className="text-xs text-rose-600">
          {routeErrors.length} route{routeErrors.length === 1 ? "" : "s"} unavailable
        </p>
      )}
      <div
        className={`relative z-0 min-h-0 w-full overflow-hidden ${
          edgeToEdge ? "flex-1" : "rounded-md border border-slate-200"
        } ${isFillHeight ? "flex-1" : (mapHeightClassName ?? "h-[min(420px,55vh)]")}`}
      >
        <MapContainer
          center={center}
          zoom={6}
          className="om-leaflet-always-dark size-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {fitPoints.length > 0 && <FitBounds positions={fitPoints} />}
          <FocusDc dcCoordMap={dcCoordMap} focusDcName={focusDcName} />
          {shipments.map((shipment, index) => {
            const r = routesById[shipment.id];
            if (typeof r !== "object" || r.kind !== "ok" || r.latLngs.length < 2) return null;
            return (
              <Polyline
                key={`route-${shipment.id}`}
                positions={r.latLngs}
                pathOptions={{ color: routeColor(index), weight: 4 }}
              />
            );
          })}
          {legDistanceLabels.map((leg) => (
            <Marker
              key={leg.key}
              position={leg.midpoint}
              interactive={false}
              icon={L.divIcon({
                className: "om-leaflet-leg-km-label",
                html: `<span class="om-leaflet-leg-km-pill">${leg.km.toFixed(1)} km</span>`,
              })}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                {leg.shipmentId}: {leg.km.toFixed(2)} km
              </Tooltip>
            </Marker>
          ))}
          {markers.map((m) => (
            <Marker
              key={m.key}
              position={[m.lat, m.lng]}
              icon={markerIconsByKey.get(m.key)!}
            >
              <Popup autoPan={false}>
                <div className="text-sm">
                  <p className="font-semibold">
                    {m.shipmentId} · {m.truckType}
                  </p>
                  <p>
                    Drop {m.sequence}: {m.dcName}
                  </p>
                  <p className="tabular-nums text-slate-500">
                    {m.lat.toFixed(5)}, {m.lng.toFixed(5)}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Selection layer for Shipments sidebar sync (doesn't alter existing pins) */}
          {onDcMarkerClick &&
            uniqueDcMarkers.map((m) => {
              const active = selectedDcName != null && m.dcName === selectedDcName;
              return (
                <CircleMarker
                  key={`dcsel-${m.dcName}`}
                  center={[m.lat, m.lng]}
                  radius={active ? 10 : 6}
                  pathOptions={{
                    color: active ? "var(--primary)" : "color-mix(in_oklch,var(--text)_35%,transparent)",
                    fillColor: active ? "var(--primary)" : "color-mix(in_oklch,var(--surface)_70%,transparent)",
                    fillOpacity: active ? 0.85 : 0.5,
                    weight: active ? 2 : 1,
                  }}
                  eventHandlers={{
                    click: () => onDcMarkerClick(m.dcName),
                  }}
                />
              );
            })}
        </MapContainer>
      </div>
    </div>
  );
}
