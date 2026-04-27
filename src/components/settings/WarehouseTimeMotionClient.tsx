"use client";

import { useState } from "react";
import { Button } from "@/components/po/ui/button";
import { Input } from "@/components/po/ui/input";
import { saveWarehouseTimeMotionSettingsAction } from "@/app/actions/warehouseTimeMotion";
import type { WarehouseTimeMotionSettings } from "@/lib/warehouseTimeMotion";

type Props = {
  initialSettings: WarehouseTimeMotionSettings;
};

type FormState = {
  pickingMp: string;
  pickingRateCasesPerHour: string;
  loadingDock: string;
  loadingRateCasesPerHour: string;
  startPickingTime: string;
  startLoadingTime: string;
};

function toFormState(settings: WarehouseTimeMotionSettings): FormState {
  return {
    pickingMp: String(settings.pickingMp),
    pickingRateCasesPerHour: String(settings.pickingRateCasesPerHour),
    loadingDock: String(settings.loadingDock),
    loadingRateCasesPerHour: String(settings.loadingRateCasesPerHour),
    startPickingTime: settings.startPickingTime,
    startLoadingTime: settings.startLoadingTime,
  };
}

function parseNonNegativeNumber(value: string, label: string, opts: { integerOnly?: boolean } = {}): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a valid number`);
  if (n < 0) throw new Error(`${label} must be >= 0`);
  if (opts.integerOnly && !Number.isInteger(n)) throw new Error(`${label} must be an integer`);
  return n;
}

function parseTimeHHmm(value: string, label: string): string {
  const raw = value.trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
    throw new Error(`${label} must use HH:mm format`);
  }
  return raw;
}

export function WarehouseTimeMotionClient({ initialSettings }: Props) {
  const [form, setForm] = useState<FormState>(toFormState(initialSettings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    let payload: WarehouseTimeMotionSettings;
    try {
      payload = {
        pickingMp: parseNonNegativeNumber(form.pickingMp, "Picking MP", { integerOnly: true }),
        pickingRateCasesPerHour: parseNonNegativeNumber(
          form.pickingRateCasesPerHour,
          "Picking Rate (Cases/Hour)",
        ),
        loadingDock: parseNonNegativeNumber(form.loadingDock, "Loading Dock", { integerOnly: true }),
        loadingRateCasesPerHour: parseNonNegativeNumber(
          form.loadingRateCasesPerHour,
          "Loading Rate (Cases/Hour)",
        ),
        startPickingTime: parseTimeHHmm(form.startPickingTime, "Start Picking Time"),
        startLoadingTime: parseTimeHHmm(form.startLoadingTime, "Start Loading Time"),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid input";
      setMessage({ type: "error", text: msg });
      return;
    }

    setSaving(true);
    const res = await saveWarehouseTimeMotionSettingsAction(payload);
    if (res.success && res.data) {
      setForm(toFormState(res.data));
      setMessage({ type: "success", text: "Warehouse Time Motion settings saved." });
    } else {
      setMessage({ type: "error", text: res.error ?? "Failed to save settings" });
    }
    setSaving(false);
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-5">
        <h2 className="text-lg font-semibold text-[#e0e0e0]">Warehouse Time Motion</h2>
        <p className="mt-1 text-sm text-[#888888]">
          Configure warehouse throughput settings for planner operations.
        </p>
      </div>

      {message && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
            message.type === "success"
              ? "border-[#1D9E75]/35 bg-[rgba(29,158,117,0.08)] text-[#1D9E75]"
              : "border-[#ff4d4d]/35 bg-[#2a1212] text-[#ffb4b4]"
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={(e) => void onSave(e)} className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#888888]">Picking MP</span>
            <Input
              type="number"
              min={0}
              step={1}
              value={form.pickingMp}
              onChange={(e) => setForm((p) => ({ ...p, pickingMp: e.target.value }))}
              required
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#888888]">
              Picking Rate (Cases/Hour)
            </span>
            <Input
              type="number"
              min={0}
              step="any"
              value={form.pickingRateCasesPerHour}
              onChange={(e) => setForm((p) => ({ ...p, pickingRateCasesPerHour: e.target.value }))}
              required
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#888888]">Loading Dock</span>
            <Input
              type="number"
              min={0}
              step={1}
              value={form.loadingDock}
              onChange={(e) => setForm((p) => ({ ...p, loadingDock: e.target.value }))}
              required
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#888888]">
              Loading Rate (Cases/Hour)
            </span>
            <Input
              type="number"
              min={0}
              step="any"
              value={form.loadingRateCasesPerHour}
              onChange={(e) => setForm((p) => ({ ...p, loadingRateCasesPerHour: e.target.value }))}
              required
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#888888]">
              Start Picking Time
            </span>
            <Input
              type="time"
              value={form.startPickingTime}
              onChange={(e) => setForm((p) => ({ ...p, startPickingTime: e.target.value }))}
              required
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#888888]">
              Start Loading Time
            </span>
            <Input
              type="time"
              value={form.startLoadingTime}
              onChange={(e) => setForm((p) => ({ ...p, startLoadingTime: e.target.value }))}
              required
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </form>
    </section>
  );
}
