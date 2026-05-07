"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/po/ui/button";
import type { PlannerDataState, ConsolidationResult } from "@/types/planner";

type SavePlanPayload = {
  name: string;
  consolidationResult: ConsolidationResult;
  inputs: PlannerDataState;
  dcCoordinates: Array<{ dcName: string; lat: number; lng: number }>;
};

function defaultNameNow(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `plan-${yyyy}${mm}${dd}-${hh}${min}`;
}

export function SavePlanDialog({
  open,
  title,
  initialName,
  summaryText,
  confirmLabel = "Save",
  loadingLabel = "Saving...",
  onClose,
  buildPayload,
  mode,
  planIdForRename,
  onSaved,
}: {
  open: boolean;
  title: string;
  initialName?: string;
  summaryText?: string;
  confirmLabel?: string;
  loadingLabel?: string;
  onClose: () => void;
  buildPayload: () => SavePlanPayload | { id: string; name: string } | null;
  mode: "create" | "rename";
  planIdForRename?: string;
  onSaved: (meta: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [collisionId, setCollisionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const resolvedInitialName = useMemo(() => initialName ?? defaultNameNow(), [initialName]);

  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setName(resolvedInitialName);
    setError(null);
    setCollisionId(null);
    setSaving(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const close = () => {
    onClose();
    window.setTimeout(() => (lastFocusedRef.current ?? closeRef.current)?.focus(), 0);
  };

  const doCreate = async () => {
    const payload = buildPayload();
    if (!payload || typeof payload !== "object" || !("consolidationResult" in payload)) return;
    const res = await fetch("/api/planner/saved-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, name }),
    });
    const json = (await res.json().catch(() => ({}))) as { meta?: { id: string; name: string }; error?: string; existingId?: string };
    if (res.status === 409) {
      setCollisionId(json.existingId ?? null);
      throw new Error(json.error || "Name already exists.");
    }
    if (!res.ok || !json.meta) throw new Error(json.error || "Failed to save plan.");
    return json.meta;
  };

  const doReplace = async (id: string) => {
    const payload = buildPayload();
    if (!payload || typeof payload !== "object" || !("consolidationResult" in payload)) return;
    const res = await fetch(`/api/planner/saved-plans/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, name }),
    });
    const json = (await res.json().catch(() => ({}))) as { meta?: { id: string; name: string }; error?: string; existingId?: string };
    if (!res.ok || !json.meta) throw new Error(json.error || "Failed to replace plan.");
    return json.meta;
  };

  const doRename = async () => {
    const id = planIdForRename;
    if (!id) throw new Error("Missing plan id.");
    const res = await fetch(`/api/planner/saved-plans/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = (await res.json().catch(() => ({}))) as { meta?: { id: string; name: string }; error?: string; existingId?: string };
    if (res.status === 409) {
      // For rename, we do not support replacing another plan; user must pick another name.
      setCollisionId(null);
      throw new Error(json.error || "Name already exists.");
    }
    if (!res.ok || !json.meta) throw new Error(json.error || "Failed to rename plan.");
    return json.meta;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setCollisionId(null);
    try {
      const meta = mode === "rename" ? await doRename() : await doCreate();
      if (!meta) return;
      onSaved(meta);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleReplace = async () => {
    if (!collisionId) return;
    if (mode === "rename") return;
    setSaving(true);
    setError(null);
    try {
      const meta = await doReplace(collisionId);
      if (!meta) return;
      onSaved(meta);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Replace failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0d0d]/80 p-4" onClick={close}>
      <div
        className="w-full max-w-md rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-plan-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="save-plan-title" className="font-display font-bold text-[#e0e0e0]">
              {title}
            </h3>
            {summaryText && <p className="mt-1 text-sm text-[#888888]">{summaryText}</p>}
          </div>
          <button
            type="button"
            onClick={close}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#141414] px-2.5 py-1.5 text-xs font-semibold text-[#e0e0e0]"
            aria-label="Close"
            ref={closeRef}
          >
            X
          </button>
        </div>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[#888888]" htmlFor="save-plan-name">
          Name
        </label>
        <input
          id="save-plan-name"
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-2 w-full rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-sm text-[#e0e0e0] placeholder:text-[#5c5c5c] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/45"
          placeholder={resolvedInitialName}
        />

        {error && (
          <p className="mt-3 rounded-lg border border-[#5a2020] bg-[#2a1212] px-3 py-2 text-sm text-[#ffb4b4]" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={close} disabled={saving}>
            Cancel
          </Button>

          {collisionId ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setCollisionId(null); inputRef.current?.focus(); }} disabled={saving}>
                Save as new
              </Button>
              <Button size="sm" variant="destructive" onClick={handleReplace} disabled={saving}>
                {saving ? loadingLabel : "Replace existing"}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? loadingLabel : confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

