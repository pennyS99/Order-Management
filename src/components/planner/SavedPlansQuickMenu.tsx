"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/po/ui/button";
import { SavePlanDialog } from "@/components/planner/SavePlanDialog";
import { usePlannerContext } from "@/context/PlannerContext";
import type { SavedPlan } from "@/types/savedPlan";
import type { SavedPlanMetadata } from "@/types/savedPlan";

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.max(0, Math.round(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function SavedPlansQuickMenu() {
  const { hydrateFromSavedPlan } = usePlannerContext();
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<SavedPlanMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [renameId, setRenameId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const renaming = useMemo(() => plans.find((p) => p.id === renameId) ?? null, [plans, renameId]);
  const deleting = useMemo(() => plans.find((p) => p.id === deleteId) ?? null, [plans, deleteId]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/planner/saved-plans", { method: "GET" });
      const json = (await res.json().catch(() => ({}))) as { plans?: SavedPlanMetadata[]; error?: string };
      if (!res.ok || !Array.isArray(json.plans)) throw new Error(json.error || "Failed to load saved plans.");
      setPlans(json.plans);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load saved plans.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const doDelete = async () => {
    if (!deleteId) return;
    setDeleteError(null);
    const res = await fetch(`/api/planner/saved-plans/${encodeURIComponent(deleteId)}`, { method: "DELETE" });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setDeleteError(json.error ?? "Delete failed.");
      return;
    }
    setPlans((prev) => prev.filter((p) => p.id !== deleteId));
    setDeleteId(null);
  };

  const editInPlanner = async (id: string) => {
    setEditingId(id);
    try {
      const res = await fetch(`/api/planner/saved-plans/${encodeURIComponent(id)}`, { method: "GET" });
      const json = (await res.json().catch(() => ({}))) as { plan?: SavedPlan; error?: string };
      if (!res.ok || !json.plan) throw new Error(json.error || "Failed to load saved plan.");
      hydrateFromSavedPlan({
        id: json.plan.meta.id,
        name: json.plan.meta.name,
        data: json.plan.inputs,
        consolidationResult: json.plan.consolidationResult,
      });
      window.location.href = "/planner";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load saved plan.");
    } finally {
      setEditingId(null);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-[8px] border border-[#333] bg-[rgba(14,14,14,0.9)] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm shadow-black/40 backdrop-blur hover:bg-[rgba(14,14,14,0.98)]"
      >
        Saved plans
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d]/92 shadow-2xl shadow-black/60 backdrop-blur">
          <div className="flex items-center justify-between gap-3 border-b border-[#2a2a2a] bg-[#141414]/70 px-4 py-2.5">
            <p className="text-sm font-semibold text-[#e0e0e0]">Saved plans</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex min-h-9 items-center rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-xs font-semibold text-[#e0e0e0] hover:border-[#1D9E75]/45 hover:text-[#1D9E75]"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#141414] text-xs font-semibold text-[#e0e0e0]"
                aria-label="Close"
              >
                X
              </button>
            </div>
          </div>

          {error && (
            <div className="px-4 py-3">
              <p className="rounded-lg border border-[#5a2020] bg-[#2a1212] px-3 py-2 text-sm text-[#ffb4b4]" role="alert">
                {error}
              </p>
            </div>
          )}

          <div className="max-h-[60vh] overflow-auto px-2 py-2">
            {loading ? (
              <p className="px-2 py-3 text-sm text-[#888888]">Loading...</p>
            ) : plans.length === 0 ? (
              <p className="px-2 py-3 text-sm text-[#888888]">No saved plans yet.</p>
            ) : (
              <ul className="space-y-2">
                {plans.map((p) => (
                  <li key={p.id} className="rounded-xl border border-[#2a2a2a] bg-[#141414]/60 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#e0e0e0]">{p.name}</p>
                        <p className="mt-1 text-xs text-[#888888]" title={new Date(p.savedAt).toLocaleString()}>
                          Saved {formatRelative(p.savedAt)} · {p.shipmentCount} shipments
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link
                          href={`/planner/saved/${encodeURIComponent(p.id)}`}
                          className="inline-flex min-h-8 items-center rounded-lg bg-[#1D9E75] px-2.5 py-1.5 text-xs font-black text-black hover:brightness-110"
                          onClick={() => setOpen(false)}
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          className="inline-flex min-h-8 items-center rounded-lg border border-[#2a2a2a] bg-[#141414] px-2.5 py-1.5 text-xs font-semibold text-[#e0e0e0] hover:border-[#1D9E75]/45 hover:text-[#1D9E75]"
                          onClick={() => setRenameId(p.id)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-8 items-center rounded-lg border border-[#2a2a2a] bg-[#141414] px-2.5 py-1.5 text-xs font-semibold text-[#e0e0e0] hover:border-[#ff6b6b]/45 hover:text-[#ffb4b4]"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteId(p.id);
                          }}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-8 items-center rounded-lg border border-[#2a2a2a] bg-[#141414] px-2.5 py-1.5 text-xs font-semibold text-[#e0e0e0] hover:border-[#1D9E75]/45 hover:text-[#1D9E75]"
                          onClick={() => void editInPlanner(p.id)}
                          disabled={editingId === p.id}
                        >
                          {editingId === p.id ? "Loading..." : "Edit"}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <SavePlanDialog
        open={renaming != null}
        title="Rename saved plan"
        initialName={renaming?.name}
        summaryText={renaming ? `${renaming.shipmentCount} shipments · ${renaming.totalOrders} orders` : undefined}
        confirmLabel="Rename"
        loadingLabel="Renaming..."
        mode="rename"
        planIdForRename={renaming?.id}
        buildPayload={() => (renaming ? { id: renaming.id, name: renaming.name } : null)}
        onClose={() => setRenameId(null)}
        onSaved={(meta) => {
          setPlans((prev) => prev.map((p) => (p.id === meta.id ? { ...p, name: meta.name } : p)));
        }}
      />

      {deleting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0d0d]/80 p-4"
          onClick={() => setDeleteId(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="font-display font-bold text-[#e0e0e0]">Delete saved plan?</h3>
            <p className="mt-2 text-sm text-[#888888]">
              This will permanently delete <span className="font-mono font-semibold text-[#e0e0e0]">{deleting.name}</span>.
            </p>
            {deleteError && (
              <p className="mt-3 rounded-lg border border-[#5a2020] bg-[#2a1212] px-3 py-2 text-sm text-[#ffb4b4]" role="alert">
                {deleteError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={doDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

