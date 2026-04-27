"use client";

import React, { useState, useCallback, useTransition } from "react";
import { FileUploadZone } from "@/components/po/FileUploadZone";
import { ResultsTable } from "@/components/po/ResultsTable";
import { ProgressTracker } from "@/components/po/ProgressTracker";
import { LoadingBar } from "@/components/po/LoadingBar";
import { extractPdfAction } from "@/app/actions/extract";
import { useHeaders } from "@/context/HeadersContext";
import { saveBatchToHistory } from "@/lib/po/batch-history";
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

  const handleBatchesChange = useCallback(
    (value: ProcessingBatch[] | ((prev: ProcessingBatch[]) => ProcessingBatch[])) => {
      setBatches((prev) => (typeof value === "function" ? value(prev) : value));
    },
    []
  );

  const handleExtractClick = () => {
    const allFiles = batches.flatMap((b) => b.files);
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
      batches.forEach((batch) => {
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

        const batch = batches.find((b) => b.files.some((bf) => bf.id === f.id));
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

      batches.forEach((batch) => {
        const recorded = batchDataMap.get(batch.id);
        const isComplete = recorded && recorded.fileCount === batch.files.length;
        if (isComplete && batch.files.length > 0) {
          saveBatchToHistory(batch.name, batch.files.length, recorded!.data);
        }
      });
    });
  };

  const allFiles = batches.flatMap((b) => b.files);
  const completedCount = allFiles.filter((f) => f.status === "done" || f.status === "error").length;
  const progressPercent = allFiles.length > 0 ? (completedCount / allFiles.length) * 100 : 0;

  return (
    <>
      <LoadingBar
        progress={progressPercent}
        isActive={isPending}
        className="fixed left-0 right-0 top-0 z-50 h-[3px] bg-[#1D9E75]"
      />

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-12">
          <section className="group relative">
            <FileUploadZone
              batches={batches}
              onBatchesChange={handleBatchesChange}
              onExtractAll={handleExtractClick}
              isExtracting={isPending}
            />
          </section>

          {batches.length > 0 && isPending && (
            <section className="animate-fade-in-up">
              <ProgressTracker batches={batches} />
            </section>
          )}

          {allData.length > 0 && (
            <section className="animate-fade-in-up mt-8">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="font-display text-2xl font-black tracking-tight text-[#e0e0e0]">
                  Extracted Records
                </h3>
              </div>
              <div className="om-panel rounded-lg p-6 md:p-8">
                <ResultsTable data={allData} headers={headers} onDataChange={setAllData} />
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
