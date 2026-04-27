"use client";

import { usePlannerContext } from "@/context/PlannerContext";
import { useMemo, useRef, useState } from "react";
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
  const [isDragOver, setIsDragOver] = useState(false);

  const ordersState = upload.orders;
  const hasFile = Boolean(ordersState.fileName);

  const emptyStateVisible = useMemo(
    () => !consolidationPlanning && !consolidationResult,
    [consolidationPlanning, consolidationResult],
  );

  return (
    <section className="space-y-3">
      <div
        className="overflow-hidden rounded-[10px]"
        style={{ background: "#0e0e0e", border: "0.5px solid #2a2a2a" }}
      >
        <div
          className="flex items-center justify-between gap-3"
          style={{ padding: "12px 16px", borderBottom: "0.5px solid #1e1e1e" }}
        >
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-[#1D9E75]" aria-hidden />
            <div className="text-[13px] font-medium text-white">Consolidation</div>
          </div>
          <span
            className="inline-flex items-center"
            style={{
              background: "#0F2218",
              color: "#1D9E75",
              fontSize: 9,
              padding: "2px 8px",
              borderRadius: 99,
            }}
          >
            ● Input
          </span>
        </div>

        <div
          className="m-[14px] flex flex-col items-center justify-center gap-2.5 rounded-[8px] border-[1.5px] border-dashed px-4 py-7 text-center transition-colors"
          style={{
            borderColor: isDragOver ? "#1D9E75" : "#2a2a2a",
            background: isDragOver ? "rgba(29,158,117,0.04)" : "transparent",
            cursor: "pointer",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void uploadCsv("orders", file);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          aria-label="Upload Orders CSV"
        >
          {!hasFile ? (
            <>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
                <path
                  d="M14 18V8M9 13l5-5 5 5"
                  stroke="#1D9E75"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5 22h18"
                  stroke="#1D9E75"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <p className="text-[12px] text-[#aaa]">
                Drop Orders CSV or{" "}
                <span className="text-[#1D9E75]" style={{ cursor: "pointer" }}>
                  browse
                </span>
              </p>
            </>
          ) : (
            <div className="flex w-full items-center justify-between gap-3 px-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[#1D9E75]">✓</span>
                <span className="min-w-0 truncate text-[12px] text-white">{ordersState.fileName}</span>
              </div>
              <button
                type="button"
                className="shrink-0 text-[#555]"
                aria-label="Replace file"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                ✕
              </button>
            </div>
          )}

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

      {consolidationPlanning && <PlannerRouteProgress />}

      {!mastersLoaded && (
        <p
          role="status"
          className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3 text-sm text-[#ffc14a]"
        >
          {mastersError ?? "Masters unavailable — open Settings → Planner or Address masters."}
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

        <div className="flex justify-end px-[14px] pb-[14px] pt-[10px]">
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
            {consolidationPlanning ? "Planning…" : "Plan routes →"}
          </button>
        </div>
      </div>

      {emptyStateVisible && (
        <div className="flex flex-col items-center justify-center gap-2 p-4 opacity-50">
          <svg width="64" height="40" viewBox="0 0 64 40" fill="none" aria-hidden>
            <circle cx="8" cy="32" r="5" stroke="#444" strokeWidth="1" />
            <circle cx="32" cy="14" r="5" stroke="#444" strokeWidth="1" />
            <circle cx="56" cy="26" r="5" stroke="#444" strokeWidth="1" />
            <path d="M13 30 Q22 16 27 16" stroke="#333" strokeWidth="1" strokeDasharray="3,2" fill="none" />
            <path d="M37 16 Q46 12 51 24" stroke="#333" strokeWidth="1" strokeDasharray="3,2" fill="none" />
          </svg>
          <span className="text-[11px] text-[#555]">No routes yet</span>
        </div>
      )}
    </section>
  );
}
