"use client";

import { CheckCircle2, FileWarning, LoaderCircle, Upload } from "lucide-react";
import type { CsvDatasetKey, CsvUploadFileState } from "@/types/planner";

interface FileUploadCardProps {
  datasetKey: CsvDatasetKey;
  label: string;
  helperText: string;
  state: CsvUploadFileState;
  onFileSelected: (dataset: CsvDatasetKey, file: File) => void;
}

const statusStyles: Record<CsvUploadFileState["status"], string> = {
  idle: "border-[#2a2a2a] bg-[#141414]",
  parsing: "border-[#1D9E75]/40 bg-[rgba(29,158,117,0.06)] ring-1 ring-[#1D9E75]/20",
  success: "border-[#1D9E75]/45 bg-[rgba(29,158,117,0.08)]",
  error: "border-[#ff4d4d]/35 bg-[#2a1212]",
};

export function FileUploadCard({
  datasetKey,
  label,
  helperText,
  state,
  onFileSelected,
}: FileUploadCardProps) {
  return (
    <label
      className={`cursor-pointer rounded-lg border p-4 transition-colors duration-200 focus-within:ring-2 focus-within:ring-[#1D9E75]/45 focus-within:ring-offset-2 focus-within:ring-offset-[#0d0d0d] ${statusStyles[state.status]}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold text-[#e0e0e0]">{label}</p>
          {helperText ? <p className="mt-0.5 text-xs text-[#888888]">{helperText}</p> : null}
        </div>
        {state.status === "parsing" ? (
          <LoaderCircle className="size-5 animate-spin text-[#1D9E75]" />
        ) : state.status === "success" ? (
          <CheckCircle2 className="size-5 text-[#1D9E75]" />
        ) : state.status === "error" ? (
          <FileWarning className="size-5 text-[#ff6b6b]" />
        ) : (
          <Upload className="size-5 text-[#888888]" />
        )}
      </div>

      <input
        className="mt-4 block w-full text-sm text-[#e0e0e0] file:mr-4 file:cursor-pointer file:rounded-lg file:border file:border-[#2a2a2a] file:bg-[#141414] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#e0e0e0] hover:file:border-[#1D9E75]/45 hover:file:text-[#1D9E75]"
        type="file"
        accept=".csv,.xlsx,.xlsm,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onFileSelected(datasetKey, file);
          }
          event.currentTarget.value = "";
        }}
      />

      <div className="mt-3 text-xs text-[#888888]">
        {state.fileName ? <p>{state.fileName}</p> : null}
        {state.rowCount > 0 && <p>{state.rowCount} rows</p>}
        {state.error && <p className="mt-1 text-[#ff6b6b]">{state.error}</p>}
      </div>
    </label>
  );
}
