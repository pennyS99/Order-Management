"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/po/ui/button";
import { SavePlanDialog } from "@/components/planner/SavePlanDialog";
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

export function SavedPlansListClient({ initialPlans }: { initialPlans: SavedPlanMetadata[] }) {
  const [plans, setPlans] = useState<SavedPlanMetadata[]>(initialPlans);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const renaming = useMemo(() => plans.find((p) => p.id === renameId) ?? null, [plans, renameId]);
  const deleting = useMemo(() => plans.find((p) => p.id === deleteId) ?? null, [plans, deleteId]);

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

  return (
    <>
      <ul className="space-y-3">
        {plans.map((p) => (
          <li
            key={p.id}
            className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] px-4 py-4 hover:border-[#1D9E75]/35"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#e0e0e0]">{p.name}</p>
                <p className="mt-1 text-xs text-[#888888]" title={new Date(p.savedAt).toLocaleString()}>
                  Saved {formatRelative(p.savedAt)} · {p.shipmentCount} shipments · {p.totalOrders} orders
                  {p.unassignedCount > 0 ? ` · ${p.unassignedCount} unassigned` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.pldList.slice(0, 3).map((pld) => (
                    <span
                      key={pld}
                      className="inline-flex items-center rounded-full border border-[#2a2a2a] bg-[#141414] px-2 py-0.5 text-[11px] font-semibold text-[#888888]"
                    >
                      PLD {pld}
                    </span>
                  ))}
                  {p.hasUnknownPld && (
                    <span className="inline-flex items-center rounded-full border border-[#2a2a2a] bg-[#141414] px-2 py-0.5 text-[11px] font-semibold text-[#888888]">
                      Unknown PLD
                    </span>
                  )}
                  {p.pldList.length > 3 && (
                    <span className="inline-flex items-center rounded-full border border-[#2a2a2a] bg-[#141414] px-2 py-0.5 text-[11px] font-semibold text-[#5c5c5c]">
                      +{p.pldList.length - 3} more
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/planner/saved/${encodeURIComponent(p.id)}`}
                  className="inline-flex min-h-9 items-center rounded-lg bg-[#1D9E75] px-3 py-2 text-xs font-black text-black hover:brightness-110"
                >
                  Open
                </Link>
                <Button size="sm" variant="outline" onClick={() => setRenameId(p.id)}>
                  Rename
                </Button>
                <Button size="sm" variant="destructive" onClick={() => { setDeleteError(null); setDeleteId(p.id); }}>
                  Delete
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <SavePlanDialog
        open={renaming != null}
        title="Rename saved plan"
        initialName={renaming?.name}
        summaryText={renaming ? `${renaming.shipmentCount} shipments · ${renaming.totalOrders} orders` : undefined}
        confirmLabel="Rename"
        loadingLabel="Renaming…"
        mode="rename"
        planIdForRename={renaming?.id}
        buildPayload={() => (renaming ? { id: renaming.id, name: renaming.name } : null)}
        onClose={() => setRenameId(null)}
        onSaved={(meta) => {
          setPlans((prev) => prev.map((p) => (p.id === meta.id ? { ...p, name: meta.name } : p)));
        }}
      />

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0d0d]/80 p-4" onClick={() => setDeleteId(null)}>
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
    </>
  );
}

