"use client";

import React, { useState, useCallback, useTransition, useRef } from "react";
import { Filter, Inbox, Plus, RefreshCw, Upload } from "lucide-react";
import { ResultsTable } from "@/components/po/ResultsTable";
import { ProgressTracker } from "@/components/po/ProgressTracker";
import { LoadingBar } from "@/components/po/LoadingBar";
import { ExportButton } from "@/components/po/ExportButton";
import { Button } from "@/components/po/ui/button";
import { Input } from "@/components/po/ui/input";
import { Badge } from "@/components/po/ui/badge";
import { extractPdfAction } from "@/app/actions/extract";
import { useHeaders } from "@/context/HeadersContext";
import { saveBatchToHistory } from "@/lib/po/batch-history";
import { getBatchName } from "@/lib/po/utils";
import type { FileProcessingStatus, POLineItem, ProcessingBatch } from "@/lib/po/types";

function updateFileInBatches(
  batches: ProcessingBatch[],
  fileId: string,
  updater: (f: FileProcessingStatus) => FileProcessingStatus
): ProcessingBatch[] {
  return batches.map((batch) => ({
    ...batch,
    files: batch.files.map((f) => (f.id === fileId ? updater(f) : f)),
  }));
}

export default function ExtractPage() {
  const { headers } = useHeaders();
  const [isPending, startTransition] = useTransition();
  const [batches, setBatches] = useState<ProcessingBatch[]>([]);
  const [allData, setAllData] = useState<POLineItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File, fileStatus: FileProcessingStatus) => {
    const formData = new FormData();
    formData.append("file", file);

    setBatches((prev) =>
      updateFileInBatches(prev, fileStatus.id, (f) => ({ ...f, status: "uploading" as const }))
    );

    try {
      setBatches((prev) =>
        updateFileInBatches(prev, fileStatus.id, (f) => ({ ...f, status: "extracting" as const }))
      );

      const result = await extractPdfAction(formData);

      if (!result.success) {
        throw new Error(result.error || "Extraction failed");
      }

      setBatches((prev) =>
        updateFileInBatches(prev, fileStatus.id, (f) => ({
          ...f,
          status: "done" as const,
          data: result.data,
          itemCount: result.data?.length ?? 0,
          metadata: result.metadata,
        }))
      );
      return result.data ?? [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setBatches((prev) =>
        updateFileInBatches(prev, fileStatus.id, (f) => ({
          ...f,
          status: "error" as const,
          error: msg,
        }))
      );
      return [];
    }
  }, []);

  const runExtraction = useCallback(
    (snapshot: ProcessingBatch[]) => {
      const allFiles = snapshot.flatMap((b) => b.files);
      const pending = allFiles.filter((f) => f.status === "pending");
      const doneFiles = allFiles.filter((f) => f.status === "done");

      if (pending.length === 0) {
        const combined = doneFiles.flatMap((f) => f.data || []);
        setAllData(combined);
        return;
      }

      startTransition(async () => {
        let aggregatedData: POLineItem[] = doneFiles.flatMap((f) => f.data || []);

        const batchDataMap = new Map<
          string,
          { name: string; fileCount: number; data: POLineItem[] }
        >();
        snapshot.forEach((batch) => {
          const doneInBatch = batch.files.filter((f) => f.status === "done");
          const data = doneInBatch.flatMap((f) => f.data || []);
          if (doneInBatch.length > 0) {
            batchDataMap.set(batch.id, {
              name: batch.name,
              fileCount: doneInBatch.length,
              data,
            });
          }
        });

        for (const f of pending) {
          const file = f.file;
          if (!file) {
            setBatches((prev) =>
              updateFileInBatches(prev, f.id, () => ({
                ...f,
                status: "error" as const,
                error: "File not available",
              }))
            );
            continue;
          }

          setBatches((prev) =>
            updateFileInBatches(prev, f.id, () => ({ ...f, status: "extracting" as const }))
          );

          const data = await processFile(file, f);
          aggregatedData = [...aggregatedData, ...data];

          const batch = snapshot.find((b) => b.files.some((bf) => bf.id === f.id));
          if (batch) {
            const existing = batchDataMap.get(batch.id) ?? {
              name: batch.name,
              fileCount: 0,
              data: [],
            };
            existing.fileCount += 1;
            existing.data = [...existing.data, ...data];
            batchDataMap.set(batch.id, existing);
          }
        }

        setAllData(aggregatedData);

        snapshot.forEach((batch) => {
          const recorded = batchDataMap.get(batch.id);
          const isComplete = recorded && recorded.fileCount === batch.files.length;
          if (isComplete && batch.files.length > 0) {
            saveBatchToHistory(batch.name, batch.files.length, recorded!.data);
          }
        });
      });
    },
    [processFile]
  );

  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    const pdfs = selected.filter((f) => f.type === "application/pdf");
    e.target.value = "";
    if (pdfs.length === 0) return;

    const newFiles: FileProcessingStatus[] = pdfs.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fileName: f.name,
      fileSize: f.size,
      file: f,
      status: "pending" as const,
    }));
    const newBatch: ProcessingBatch = {
      id: `batch-${Date.now()}`,
      name: getBatchName(),
      files: newFiles,
      createdAt: Date.now(),
    };

    setBatches((prev) => {
      const next = [...prev, newBatch];
      queueMicrotask(() => runExtraction(next));
      return next;
    });
  };

  const allFiles = batches.flatMap((b) => b.files);
  const completedCount = allFiles.filter((f) => f.status === "done" || f.status === "error").length;
  const progressPercent = allFiles.length > 0 ? (completedCount / allFiles.length) * 100 : 0;
  const poCount = new Set(allData.map((row) => row.po_number).filter(Boolean)).size;
  const skuCount = allData.filter((row) => row.product_code || row.product_name).length;

  return (
    <>
      <LoadingBar
        progress={progressPercent}
        isActive={isPending}
        className="fixed left-0 right-0 top-0 z-50 h-[3px] bg-[var(--om-accent)]"
      />

      <main className="h-[calc(100vh-var(--om-toolbar-h))] min-h-0 overflow-hidden py-5">
        <div className="flex h-full min-h-0 flex-col gap-3">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-[18px] font-semibold tracking-tight text-[var(--text)]">
                Extracted PO lines
              </h1>
              <Badge variant="success" className="h-5 px-2 font-mono text-[10px]">
                {allData.length} rows
              </Badge>
              <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                {poCount} POs · {skuCount} SKUs
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                className="hidden"
                onChange={handlePdfFileChange}
              />
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={() => runExtraction(batches)}
                disabled={isPending || batches.length === 0}
                aria-label="Refresh extraction results"
              >
                <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </Button>
              <ExportButton
                data={allData}
                headers={headers}
                disabled={allData.length === 0}
                variant="outline"
                label=".xlsx"
                className="h-8 rounded-md px-3 text-[11px] font-semibold"
                showStatusText={false}
              />
              <Button
                variant="success"
                className="h-8 rounded-md px-3 text-[11px] font-semibold"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
                aria-label="Upload PO"
              >
                <Upload className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                Upload PO
              </Button>
            </div>
          </header>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="relative w-full min-w-[240px] max-w-[460px] flex-1">
                <Filter
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <Input
                  placeholder="Filter PO #, SKU, DC..."
                  className="h-9 rounded-md pl-9 text-[12px] placeholder:text-[var(--muted-foreground)]"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#9ca3af]">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#22c55e]" aria-hidden />
                Live
              </span>
            </div>
          </div>

          {allFiles.length > 0 && (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--muted-foreground)]">
              <span>
                <span className="font-mono text-[var(--text)]">{allFiles.length}</span> PDF
                {allFiles.length === 1 ? "" : "s"} this session
              </span>
              <button
                type="button"
                onClick={() => {
                  setBatches([]);
                  setAllData([]);
                }}
                disabled={isPending}
                className="font-medium text-[var(--primary)] hover:underline disabled:opacity-50"
              >
                Clear session
              </button>
            </div>
          )}

          {batches.length > 0 && isPending && (
            <section className="shrink-0 animate-fade-in-up">
              <ProgressTracker batches={batches} />
            </section>
          )}

          <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3">
              <ResultsTable
                data={allData}
                headers={headers}
                onDataChange={setAllData}
                showToolbar={false}
                fill
                className="min-h-0 flex-1 w-full"
                tableContainerClassName="min-h-0 flex-1 w-full max-h-none overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface-elevated)]"
              />
            </div>

            {allData.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="flex max-w-[360px] flex-col items-center text-center">
                  <div className="relative mb-4 grid h-10 w-10 place-items-center rounded-full border border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.10)] text-[#86efac]">
                    <Inbox className="h-5 w-5" aria-hidden />
                    <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-[rgba(34,197,94,0.35)] bg-[#0f1117] text-[#22c55e]">
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </div>
                  <div className="text-[13px] font-semibold text-white">No PO lines</div>
                  <div className="mt-1 text-[11px] text-[#6b7280]">
                    Upload a PDF to begin extraction.
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex h-9 shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[11px] text-[var(--muted-foreground)]">
              <span className="font-mono">
                {allData.length} of {allData.length}
              </span>
              <span className="font-mono text-[var(--muted-foreground)]">v2.14.0</span>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
