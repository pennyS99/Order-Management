"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Download, History } from "lucide-react";
import { BrandMark } from "@/components/po/BrandMark";
import { Button } from "@/components/po/ui/button";
import { getBatchHistory, clearBatchHistory } from "@/lib/po/batch-history";
import { useHeaders } from "@/context/HeadersContext";
import type { BatchHistoryEntry, POLineItem } from "@/lib/po/types";

function getChannelsFromData(data: POLineItem[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const row of data) {
    const channel = row.retailer || "Unknown";
    map.set(channel, (map.get(channel) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const CONFIRM_TEXT = "DELETE";

export default function HistoryPage() {
  const { headers } = useHeaders();
  const [history, setHistory] = useState<BatchHistoryEntry[]>([]);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmInput, setClearConfirmInput] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const clearDialogRef = useRef<HTMLDivElement | null>(null);
  const clearInputRef = useRef<HTMLInputElement | null>(null);
  const clearAllTriggerRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setHistory(getBatchHistory());
  }, []);

  const handleClearAll = () => {
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShowClearConfirm(true);
    setClearConfirmInput("");
  };

  const handleConfirmClear = () => {
    if (clearConfirmInput !== CONFIRM_TEXT) return;
    clearBatchHistory();
    setHistory([]);
    setShowClearConfirm(false);
    setClearConfirmInput("");
  };

  const handleCancelClear = () => {
    setShowClearConfirm(false);
    setClearConfirmInput("");
  };

  useEffect(() => {
    if (!showClearConfirm) return;
    const dialog = clearDialogRef.current;
    if (!dialog) return;

    clearInputRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancelClear();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => {
        (lastFocusedRef.current ?? clearAllTriggerRef.current)?.focus();
      }, 0);
    };
  }, [showClearConfirm]);

  const handleExport = async (entry: BatchHistoryEntry) => {
    if (entry.data.length === 0) return;
    setExportError(null);
    setExportingId(entry.id);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: entry.data,
          headers,
          options: {
            summarySheet: true,
            perRetailer: true,
            freezeHeader: true,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] || "PO_Extracted.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="pb-12">
      {showClearConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0d0d]/80"
          onClick={handleCancelClear}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-history-title"
            aria-describedby="clear-history-description"
            ref={clearDialogRef}
          >
            <h3 id="clear-history-title" className="font-display font-bold text-[#e0e0e0]">Clear all history?</h3>
            <p id="clear-history-description" className="mt-2 text-sm text-[#888888]">
              This will permanently delete all batch history. Type{" "}
              <span className="font-mono font-semibold text-[#1D9E75]">{CONFIRM_TEXT}</span> to
              confirm.
            </p>
            <input
              type="text"
              value={clearConfirmInput}
              onChange={(e) => setClearConfirmInput(e.target.value)}
              placeholder={CONFIRM_TEXT}
              className="mt-3 w-full rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-sm text-[#e0e0e0] placeholder:text-[#5c5c5c] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/45"
              autoFocus
              ref={clearInputRef}
              aria-label="Type DELETE to confirm clearing history"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleCancelClear}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmClear}
                disabled={clearConfirmInput !== CONFIRM_TEXT}
              >
                Clear all
              </Button>
            </div>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-[#2a2a2a] bg-[#0d0d0d]">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <Link
              href="/extract"
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#888888] transition-colors duration-150 hover:text-[#1D9E75]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Extract
            </Link>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="text-[#888888] hover:text-[#1D9E75]"
                ref={clearAllTriggerRef}
              >
                Clear all
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 mb-2">
            <BrandMark size="sm" />
            <h1 className="font-display text-xl font-black tracking-tight text-[#e0e0e0]">
              Batch History
            </h1>
          </div>
          <p className="mt-1 text-sm text-[#888888]">
            Previously processed batches. Re-export to Excel.
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {exportError && (
          <p role="alert" className="mb-3 rounded-lg border border-[#5a2020] bg-[#2a1212] px-3 py-2 text-sm text-[#ffb4b4]">
            {exportError}
          </p>
        )}
        {history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#2a2a2a] bg-[#1a1a1a] py-16 text-center">
            <History className="mx-auto mb-3 h-10 w-10 text-[#888888]" />
            <p className="text-sm font-semibold text-[#e0e0e0]">No batch history yet</p>
            <p className="mt-1 text-sm text-[#888888]">
              Processed batches will appear here after extraction completes.
            </p>
            <Link href="/extract">
              <Button variant="outline" className="mt-4">
                Go to Extract
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[#888888]">
              {history.length} batch{history.length !== 1 ? "es" : ""} in history
            </p>

            <ul className="space-y-3">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex cursor-default items-center justify-between gap-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 transition-[border-color,box-shadow] duration-150 hover:border-[#1D9E75]/35"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#e0e0e0]">
                      {entry.batchName}
                    </p>
                    <p className="mt-0.5 text-sm text-[#888888]">
                      {entry.fileCount} PO{entry.fileCount !== 1 ? "s" : ""} ·{" "}
                      {entry.itemCount} SKU{entry.itemCount !== 1 ? "s" : ""} ·{" "}
                      {formatDate(entry.completedAt)}
                    </p>
                    {entry.data.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {getChannelsFromData(entry.data).map(({ name, count }) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2a2a] bg-[rgba(26,26,26,0.72)] px-2 py-0.5 text-xs font-semibold text-[#888888]"
                          >
                            <span className="h-1 w-1 rounded-full bg-[#1D9E75]" aria-hidden />
                            {name}
                            <span className="ml-0.5 text-[#5c5c5c]">({count})</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleExport(entry)}
                    disabled={entry.data.length === 0 || exportingId !== null}
                  >
                    {exportingId === entry.id ? (
                      "Exporting..."
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-1" />
                        Export
                      </>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
