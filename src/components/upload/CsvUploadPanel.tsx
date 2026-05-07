"use client";

import { usePlannerContext } from "@/context/PlannerContext";
import { useMemo, useRef } from "react";
import { Route } from "lucide-react";
import { PlannerRouteProgress } from "@/components/planner/PlannerRouteProgress";

export function CsvUploadPanel() {
  const {
    upload,
    uploadCsv,
    allRequiredFilesReady,
    runPlannerConsolidation,
    mastersLoaded,
    mastersError,
    consolidationPlanning,
    consolidationPlanningError,
    consolidationResult,
  } = usePlannerContext();

  const inputRef = useRef<HTMLInputElement | null>(null);

  const ordersState = upload.orders;
  const hasFile = Boolean(ordersState.fileName);

  const emptyStateVisible = useMemo(
    () => !consolidationPlanning && !consolidationResult,
    [consolidationPlanning, consolidationResult],
  );

  return (
    <section className="space-y-3">
      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-[var(--primary)]" aria-hidden />
            <div>
              <div className="text-[13px] font-medium text-[var(--text)]">
                Route planning
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                Upload an order file to build consolidated shipments.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-[7px] px-[14px] py-[8px] text-[12px] font-medium transition-colors"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            {hasFile ? "Replace order file" : "Upload order file"}
          </button>

          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".csv,.xlsx,.xlsm,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadCsv("orders", file);
              event.currentTarget.value = "";
            }}
          />
        </div>

        {hasFile && (
          <div className="mt-3 flex min-w-0 items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
              <span className="text-[var(--primary)]">Ready</span>
              <span className="min-w-0 truncate">{ordersState.fileName}</span>
            </div>

            <button
              type="button"
              className="shrink-0 text-[12px] font-medium text-[var(--primary)] hover:underline"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </button>
          </div>
        )}

      {consolidationPlanning && <PlannerRouteProgress />}

      {!mastersLoaded && (
        <p
          role="status"
          className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3 text-sm text-[#ffc14a]"
        >
          {mastersError ?? "Master data is unavailable. Open Configure > Planner data and check address masters."}
        </p>
      )}

      {consolidationPlanningError && (
        <p
          role="alert"
          className="rounded-lg border border-[#5a2020] bg-[#2a1212] px-4 py-3 text-sm text-[#ffb4b4]"
        >
          {consolidationPlanningError}
        </p>
      )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={!allRequiredFilesReady || consolidationPlanning}
            onClick={() => void runPlannerConsolidation()}
            className="rounded-[7px] px-[18px] py-[7px] text-[12px] font-medium transition-colors"
            style={
              !allRequiredFilesReady || consolidationPlanning
                ? {
                    background: "#1e1e1e",
                    border: "0.5px solid #2a2a2a",
                    color: "#444",
                    cursor: "not-allowed",
                  }
                : {
                    background: "#1D9E75",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                  }
            }
          >
            {consolidationPlanning ? "Planning..." : "Plan routes"}
          </button>
        </div>
      </div>

      {emptyStateVisible && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <svg width="64" height="40" viewBox="0 0 64 40" fill="none" aria-hidden>
            <circle cx="8" cy="32" r="5" stroke="#444" strokeWidth="1" />
            <circle cx="32" cy="14" r="5" stroke="#444" strokeWidth="1" />
            <circle cx="56" cy="26" r="5" stroke="#444" strokeWidth="1" />
            <path d="M13 30 Q22 16 27 16" stroke="#333" strokeWidth="1" strokeDasharray="3,2" fill="none" />
            <path d="M37 16 Q46 12 51 24" stroke="#333" strokeWidth="1" strokeDasharray="3,2" fill="none" />
          </svg>
          <span className="text-[12px] font-medium text-[var(--text)]">No route plan yet</span>
          <span className="max-w-sm text-[11px] text-[var(--muted-foreground)]">
            Upload orders, then run route planning to see consolidated shipments here.
          </span>
        </div>
      )}
    </section>
  );
}
