"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, RotateCcw } from "lucide-react";
import { Button } from "@/components/po/ui/button";
import { Input } from "@/components/po/ui/input";
import { Switch } from "@/components/po/ui/switch";
import { usePlannerResultsColumns } from "@/context/PlannerResultsColumnsContext";
import type { PlannerResultsTab } from "@/lib/planner/results-columns";
import { normalizeOrder } from "@/lib/planner/results-columns";

const TAB_LABEL: Record<PlannerResultsTab, string> = {
  dc: "DC stops",
  po: "PO lines",
  unassigned: "Unassigned",
};

export function PlannerResultsColumnsConfig() {
  const { getTabColumns, setTabColumns, resetTab } = usePlannerResultsColumns();
  const [tab, setTab] = useState<PlannerResultsTab>("dc");

  const columns = getTabColumns(tab);
  const activeCount = columns.filter((c) => c.enabled).length;

  const reorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const next = columns.slice();
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    setTabColumns(tab, normalizeOrder(next));
  };

  const toggle = (id: string, enabled: boolean) => {
    setTabColumns(
      tab,
      columns.map((c) => (c.id === id ? { ...c, enabled } : c)),
    );
  };

  const updateLabel = (id: string, label: string) => {
    setTabColumns(
      tab,
      columns.map((c) => (c.id === id ? { ...c, label } : c)),
    );
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", index.toString());
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = Number.parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (!Number.isNaN(fromIndex)) reorder(fromIndex, toIndex);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#e0e0e0]">Results columns</h3>
          <p className="mt-0.5 text-xs text-[#888888]">
            Configure how columns appear in Planner results tables. Saved locally in this browser.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#888888]">
            {activeCount} of {columns.length} active
          </span>
          <Button variant="outline" size="sm" onClick={() => resetTab(tab)}>
            <RotateCcw className="mr-1 h-4 w-4" />
            Reset defaults
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(TAB_LABEL) as PlannerResultsTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t
                ? "border-[#1D9E75]/55 bg-[rgba(29,158,117,0.12)] text-[#1D9E75]"
                : "border-[#2a2a2a] bg-[#141414] text-[#888888] hover:text-[#e0e0e0]"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {columns.map((c, index) => (
          <li
            key={c.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            className="flex items-center gap-3 rounded-lg border border-[#2a2a2a] bg-[#141414] p-3 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-5 w-5 text-[#555]" />
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded p-1 text-[#888888] hover:bg-[#1a1a1a] disabled:opacity-40"
                onClick={() => reorder(index, Math.max(0, index - 1))}
                disabled={index === 0}
                aria-label={`Move ${c.label} up`}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-[#888888] hover:bg-[#1a1a1a] disabled:opacity-40"
                onClick={() => reorder(index, Math.min(columns.length - 1, index + 1))}
                disabled={index === columns.length - 1}
                aria-label={`Move ${c.label} down`}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <Switch
              checked={c.enabled}
              onCheckedChange={(checked) => toggle(c.id, !!checked)}
              aria-label={`Toggle ${c.label} column`}
            />
            <Input
              value={c.label}
              onChange={(e) => updateLabel(c.id, e.target.value)}
              disabled={!c.enabled}
              className="flex-1"
              aria-label={`Column label for ${c.id}`}
            />
            <span className="shrink-0 font-mono text-[11px] text-[#555]">{c.id}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

