"use client";

import React, { useState } from "react";
import { CheckCircle, XCircle, Loader2, FileText, ChevronDown, ChevronRight } from "lucide-react";
import type { FileProcessingStatus, ProcessingBatch } from "@/lib/po/types";
import { cn } from "@/lib/po/utils";

interface ProgressTrackerProps {
  batches: ProcessingBatch[];
}

/** Wrapper div for SVG spinner - enables hardware acceleration (rule: animate wrapper, not SVG) */
const SpinnerIcon = ({ className }: { className?: string }) => (
  <div className={`inline-flex shrink-0 ${className ?? ""}`}>
    <Loader2 className="h-3.5 w-3.5 text-inherit" />
  </div>
);

const statusIcons: Record<string, React.ReactNode> = {
  pending: <FileText className="h-3.5 w-3.5 text-slate-500" />,
  uploading: <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-[#1D9E75]" />,
  extracting: <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-[#1D9E75]" />,
  done: <CheckCircle className="h-3.5 w-3.5 text-emerald-300" />,
  error: <XCircle className="h-3.5 w-3.5 text-rose-300" />,
};

function getBatchStatus(files: FileProcessingStatus[]): string {
  const hasError = files.some((f) => f.status === "error");
  const hasPending = files.some((f) => ["pending", "uploading", "extracting"].includes(f.status));
  if (hasError) return "error";
  if (hasPending) return "processing";
  return "done";
}

export function ProgressTracker({ batches }: ProgressTrackerProps) {
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(() => new Set());

  if (batches.length === 0) return null;

  const toggleBatch = (batchId: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900/70">
      <div className="border-b border-slate-800 bg-slate-900 px-4 py-2.5">
        <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">Processing</h3>
      </div>
      <ul className="max-h-48 divide-y divide-slate-800 overflow-y-auto">
        {batches.map((batch) => {
          const isExpanded = expandedBatches.has(batch.id);
          const batchStatus = getBatchStatus(batch.files);
          const totalItems = batch.files.reduce(
            (sum, f) => sum + (f.itemCount ?? 0),
            0
          );
          const statusIcon =
            batchStatus === "processing"
              ? statusIcons.extracting
              : statusIcons[batchStatus];

          return (
            <li
              key={batch.id}
              className={cn(
                "bg-slate-900/70",
                batchStatus === "error" && "bg-rose-500/10",
                batchStatus === "done" && "bg-slate-900/70"
              )}
            >
              <button
                type="button"
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-left transition-colors duration-150 hover:bg-slate-800/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D9E75]/45 focus-visible:ring-inset",
                  batchStatus === "error" && "bg-rose-500/10"
                )}
                onClick={() => toggleBatch(batch.id)}
                aria-expanded={isExpanded}
                aria-controls={`progress-batch-${batch.id}`}
              >
                <span className="shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                </span>
                <span className="shrink-0">{statusIcon}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">
                  {batch.name}
                </span>
                <div className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
                  <span>
                    {batch.files.length} PO{batch.files.length !== 1 ? "s" : ""}
                  </span>
                  {totalItems > 0 && <span>· {totalItems} SKUs</span>}
                </div>
              </button>
              {isExpanded && (
                <ul className="border-t border-slate-800 bg-slate-950/70" id={`progress-batch-${batch.id}`}>
                  {batch.files.map((f) => (
                    <li
                      key={f.id}
                      className={cn(
                        "px-3 py-1.5 pl-10 text-sm",
                        f.status === "error" && "bg-rose-500/10",
                        f.status === "done" && "bg-slate-950/30"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="shrink-0">{statusIcons[f.status]}</span>
                        <span className="max-w-[200px] truncate text-slate-300">
                          {f.fileName}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                        {f.metadata?.parserUsed && (
                          <span
                            className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-300"
                            title={`Parser: ${f.metadata.parserUsed}`}
                          >
                            {f.metadata.parserUsed}
                          </span>
                        )}
                        {f.metadata && (
                          <span
                            className={cn(
                              "rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300",
                              f.metadata.method === "digital"
                                ? "border-[#1D9E75]/35 bg-[rgba(29,158,117,0.08)] text-[#1D9E75]"
                                : f.metadata.method === "ocr"
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                : "border-purple-500/30 bg-purple-500/10 text-purple-300"
                            )}
                          >
                            {f.metadata.method === "digital"
                              ? "Digital"
                              : f.metadata.method === "ocr"
                              ? "OCR"
                              : "Mixed"}
                          </span>
                        )}
                        {f.itemCount !== undefined && (
                          <span>{f.itemCount} SKUs</span>
                        )}
                        </div>
                        {f.error && (
                        <span
                          className="max-w-[180px] shrink-0 truncate text-xs text-rose-300"
                          title={f.error}
                        >
                          {f.error}
                        </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
