"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/po/ui/button";
import { usePlannerContext } from "@/context/PlannerContext";
import type { SavedPlan } from "@/types/savedPlan";
import { buildDcSummaryRows } from "@/lib/planner/dcSummaryRows";
import { SavedPlanDetailDcTable } from "@/components/planner/saved-plan-detail-dc-table";

function normalizeIso(value: string): string {
  return value;
}

function extractPldForOrder(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const PlannerShipmentsOverviewMap = dynamic(
  () => import("./PlannerShipmentsOverviewMap").then((m) => m.PlannerShipmentsOverviewMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(420px,55vh)] items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#141414] text-xs font-medium text-[#888888]">
        Loading map...
      </div>
    ),
  },
);

export function SavedPlanDetailClient({ plan }: { plan: SavedPlan }) {
  const { hydrateFromSavedPlan } = usePlannerContext();
  const [activeTab, setActiveTab] = useState<string>("all");

  const tabs = useMemo(() => {
    const base = [{ key: "all", label: "All PLDs" }];
    const plds = plan.meta.pldList.map((p) => ({ key: `pld:${normalizeIso(p)}`, label: p }));
    const unknown = plan.meta.hasUnknownPld ? [{ key: "unknown", label: "Unknown PLD" }] : [];
    return [...base, ...plds, ...unknown];
  }, [plan.meta.hasUnknownPld, plan.meta.pldList]);

  const filteredShipments = useMemo(() => {
    if (activeTab === "all") return plan.consolidationResult.shipments;
    if (activeTab === "unknown") {
      return plan.consolidationResult.shipments.filter((s) =>
        s.orders.some((o) => extractPldForOrder(o.pld) === null),
      );
    }
    if (activeTab.startsWith("pld:")) {
      const pld = activeTab.slice("pld:".length);
      return plan.consolidationResult.shipments.filter((s) =>
        s.orders.some((o) => extractPldForOrder(o.pld) === pld),
      );
    }
    return plan.consolidationResult.shipments;
  }, [activeTab, plan.consolidationResult.shipments]);

  const dcCoordMap = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const c of plan.dcCoordinates) {
      m.set(c.dcName, { lat: c.lat, lng: c.lng });
    }
    return m;
  }, [plan.dcCoordinates]);

  const summary = useMemo(() => {
    const totalOrders = filteredShipments.reduce((acc, s) => acc + s.orders.length, 0);
    return `${filteredShipments.length} shipments · ${totalOrders} orders`;
  }, [filteredShipments]);

  const dcRows = useMemo(() => buildDcSummaryRows(filteredShipments), [filteredShipments]);

  const loadIntoPlanner = () => {
    hydrateFromSavedPlan({
      id: plan.meta.id,
      name: plan.meta.name,
      data: plan.inputs,
      consolidationResult: plan.consolidationResult,
    });
    window.location.href = "/planner";
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#888888]">
              <Link href="/planner/saved" className="hover:text-[#1D9E75]">
                Saved plans
              </Link>{" "}
              / <span className="text-[#e0e0e0]">{plan.meta.name}</span>
            </p>
            <h1 className="mt-1 truncate font-display text-xl font-black tracking-tight text-[#e0e0e0]">
              {plan.meta.name}
            </h1>
            <p className="mt-1 text-sm text-[#888888]">{summary}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={loadIntoPlanner}>Open in Planner</Button>
            <Link
              href="/planner/saved"
              className="inline-flex min-h-9 items-center rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-xs font-semibold text-[#e0e0e0] hover:border-[#1D9E75]/45 hover:text-[#1D9E75]"
            >
              Back to shipments
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={
                t.key === activeTab
                  ? "rounded-full bg-[#1D9E75] px-3 py-1.5 text-xs font-black text-black"
                  : "rounded-full border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-xs font-semibold text-[#e0e0e0] hover:border-[#1D9E75]/45 hover:text-[#1D9E75]"
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] shadow-inner shadow-black/30">
          <div className="border-b border-[#2a2a2a] bg-[#141414] px-4 py-2.5">
            <h3 className="text-sm font-bold text-[#e0e0e0]">Route map</h3>
          </div>
          <div className="p-3 sm:p-4">
            <PlannerShipmentsOverviewMap shipments={filteredShipments} dcCoordMap={dcCoordMap} />
          </div>
        </div>

        {dcRows.length > 0 && <SavedPlanDetailDcTable rows={dcRows} />}

        <div className="rounded-xl border border-zinc-800 bg-[#141414] p-4">
          <h3 className="text-sm font-semibold text-slate-100">Unassigned orders</h3>
          {plan.consolidationResult.unassignedOrders.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">All order lines are routed.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              {plan.consolidationResult.unassignedOrders.map((entry, index) => (
                <p
                  key={`unassigned-${index}`}
                  className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
                >
                  {entry.order.purchaseOrder || "Unknown PO"} ({entry.order.dcName || "Unknown DC"}): {entry.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

