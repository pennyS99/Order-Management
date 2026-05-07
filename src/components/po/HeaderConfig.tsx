"use client";

import React from "react";
import { GripVertical, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { Switch } from "@/components/po/ui/switch";
import { Input } from "@/components/po/ui/input";
import { Button } from "@/components/po/ui/button";
import type { HeaderConfig as HeaderConfigType } from "@/lib/po/types";
import { useHeaders } from "@/context/HeadersContext";

const STORAGE_KEY = "po-extractor-headers";

interface HeaderConfigProps {
  headers: HeaderConfigType[];
  onHeadersChange: (headers: HeaderConfigType[]) => void;
}

function saveHeaders(headers: HeaderConfigType[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(headers));
  } catch {}
}

export function HeaderConfig({ headers, onHeadersChange }: HeaderConfigProps) {
  const { reloadDefaultHeaders } = useHeaders();

  const activeCount = headers.filter((h) => h.enabled).length;
  const totalCount = headers.length;

  const toggle = (key: string, enabled: boolean) => {
    const next = headers.map((h) =>
      h.key === key ? { ...h, enabled } : h
    );
    onHeadersChange(next);
    saveHeaders(next);
  };

  const updateLabel = (key: string, label: string) => {
    const next = headers.map((h) =>
      h.key === key ? { ...h, label } : h
    );
    onHeadersChange(next);
    saveHeaders(next);
  };

  const reorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const next = [...headers];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    const withOrder = next.map((h, i) => ({ ...h, order: i }));
    onHeadersChange(withOrder);
    saveHeaders(withOrder);
  };

  const resetToDefault = () => {
    void (async () => {
      const defaults = await reloadDefaultHeaders();
      onHeadersChange([...defaults]);
      saveHeaders(defaults);
    })();
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
    const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (!isNaN(fromIndex)) reorder(fromIndex, toIndex);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-slate-800 text-sm">
          Excel export columns
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            {activeCount} of {totalCount} columns active
          </span>
          <Button variant="outline" size="sm" onClick={resetToDefault}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset defaults
          </Button>
        </div>
      </div>

      <ul className="space-y-2">
        {headers.map((h, index) => (
          <li
            key={h.key}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors duration-150 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-5 w-5 text-slate-400" />
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                onClick={() => reorder(index, Math.max(0, index - 1))}
                disabled={index === 0}
                aria-label={`Move ${h.label} up`}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                onClick={() => reorder(index, Math.min(headers.length - 1, index + 1))}
                disabled={index === headers.length - 1}
                aria-label={`Move ${h.label} down`}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <Switch
              checked={h.enabled}
              onCheckedChange={(checked) => toggle(h.key, !!checked)}
              aria-label={`Toggle ${h.label} column`}
            />
            <Input
              value={h.label}
              onChange={(e) => updateLabel(h.key, e.target.value)}
              className="flex-1"
              disabled={!h.enabled}
              aria-label={`Column label for ${h.key}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
