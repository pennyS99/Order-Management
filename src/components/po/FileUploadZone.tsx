"use client";

import React, { useCallback, useRef, useState } from "react";
import { X, FileText, ChevronDown, File as FileIcon, Folder, Trash2, ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/po/BrandMark";
import { Button } from "@/components/po/ui/button";
import { getBatchName } from "@/lib/po/utils";
import type { FileProcessingStatus, ProcessingBatch } from "@/lib/po/types";
import { cn } from "@/lib/po/utils";

interface FileSystemFileEntry {
  isFile: boolean;
  isDirectory: boolean;
  file: (cb: (f: File) => void) => void;
}
interface FileSystemDirectoryEntry {
  isFile: boolean;
  isDirectory: boolean;
  createReader: () => {
    readEntries: (
      successCb: (entries: (FileSystemFileEntry | FileSystemDirectoryEntry)[]) => void,
      errorCb?: (err: DOMException) => void
    ) => void;
  };
}

function getPdfFilesFromEntry(
  entry: FileSystemFileEntry | FileSystemDirectoryEntry
): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file((file) => {
        resolve(file.type === "application/pdf" ? [file] : []);
      });
    });
  }
  const dir = entry as FileSystemDirectoryEntry;
  const reader = dir.createReader();
  const allFiles: File[] = [];

  const readBatch = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      reader.readEntries(
        async (entries) => {
          if (entries.length === 0) {
            resolve();
            return;
          }
          for (const e of entries) {
            const files = await getPdfFilesFromEntry(e);
            allFiles.push(...files);
          }
          await readBatch();
          resolve();
        },
        reject
      );
    });
  };

  return readBatch().then(() => allFiles);
}

interface FileUploadZoneProps {
  batches: ProcessingBatch[];
  onBatchesChange: (batches: ProcessingBatch[] | ((prev: ProcessingBatch[]) => ProcessingBatch[])) => void;
  onExtractAll: () => void;
  isExtracting: boolean;
}

export function FileUploadZone({
  batches,
  onBatchesChange,
  onExtractAll,
  isExtracting,
}: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(() => new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const totalFiles = batches.reduce((sum, b) => sum + b.files.length, 0);

  const addFiles = useCallback(
    (fileList: File[]) => {
      if (fileList.length === 0) return;
      const newFiles: FileProcessingStatus[] = fileList.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fileName: f.name,
        fileSize: f.size,
        file: f,
        status: "pending",
      }));
      const newBatch: ProcessingBatch = {
        id: `batch-${Date.now()}`,
        name: getBatchName(),
        files: newFiles,
        createdAt: Date.now(),
      };
      
      onBatchesChange((prev) => [...prev, newBatch]);
    },
    [onBatchesChange]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragActive) setIsDragActive(true);
  }, [isDragActive]);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      const dt = e.dataTransfer;
      if (!dt) return;

      const items = Array.from(dt.items);
      const pdfFiles: File[] = [];

      for (const item of items) {
        if (item.kind !== "file") continue;
        const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemFileEntry | FileSystemDirectoryEntry | null }).webkitGetAsEntry?.();
        if (entry) {
          setIsScanning(true);
          try {
            const files = await getPdfFilesFromEntry(entry as unknown as FileSystemFileEntry | FileSystemDirectoryEntry);
            pdfFiles.push(...files);
          } finally {
            setIsScanning(false);
          }
        } else {
          const file = item.getAsFile();
          if (file?.type === "application/pdf") pdfFiles.push(file);
        }
      }
      addFiles(pdfFiles);
    },
    [addFiles]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    addFiles(selected.filter((f) => f.type === "application/pdf"));
    e.target.value = "";
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    addFiles(selected.filter((f) => f.type === "application/pdf"));
    e.target.value = "";
  };

  const clearAll = () => onBatchesChange([]);

  const removeBatch = (batchId: string) => {
    onBatchesChange(batches.filter((b) => b.id !== batchId));
  };

  const removeFile = (batchId: string, fileId: string) => {
    onBatchesChange(
      batches.map((b) => {
        if (b.id !== batchId) return b;
        const newFiles = b.files.filter((f) => f.id !== fileId);
        if (newFiles.length === 0) return null;
        return { ...b, files: newFiles };
      }).filter((b): b is ProcessingBatch => b !== null)
    );
  };

  const toggleBatch = (batchId: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const hasBatches = batches.length > 0;
  const hasPending = batches.some((b) => b.files.some((f) => f.status === "pending"));
  const canExtract = hasBatches && hasPending && !isExtracting;

  return (
    <div className="w-full space-y-6">
      {/* Upload Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "group relative flex overflow-hidden transition-all duration-500 ease-out",
          hasBatches 
            ? "min-h-[140px] w-full flex-col items-center justify-between border-2 border-dashed px-8 py-6 md:flex-row rounded-lg"
            : "min-h-[280px] w-full flex-col items-center justify-center border-2 border-dashed rounded-lg",
          isDragActive 
            ? "scale-[1.01] border-[#1D9E75]/70 bg-[#141414] shadow-[0_0_40px_-8px_rgba(29,158,117,0.25)]" 
            : "border-[#2a2a2a] bg-[#1a1a1a]/90 backdrop-blur-md hover:border-[#1D9E75]/35 hover:bg-[#1a1a1a]"
        )}
      >
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100 bg-[rgba(29,158,117,0.03)]" />
        
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: "", directory: "", multiple: true } as React.InputHTMLAttributes<HTMLInputElement>)}
          onChange={handleFolderSelect}
          className="hidden"
        />
        
        <div className={cn(
          "flex z-10 w-full transition-all duration-500",
          hasBatches
            ? "flex-col sm:flex-row items-center justify-between gap-6"
            : "flex-col items-center justify-center text-center space-y-5 px-6 py-10"
        )}>
          {/* Left part: Icon and Text */}
          <div className={cn(
            "flex w-full items-center",
            hasBatches ? "flex-row text-left" : "flex-col justify-center text-center"
          )}>
            <div className={cn(
              "flex items-center justify-center bg-transparent text-slate-300 transition-all duration-500 shrink-0",
              hasBatches ? "w-16 h-16 mr-6" : "w-24 h-24 mb-6",
              isDragActive ? "scale-110 -rotate-3" : "group-hover:-translate-y-2"
            )}>
              <BrandMark
                size={hasBatches ? "md" : "lg"}
                className={cn(
                  "shadow-none",
                  isDragActive ? "opacity-100" : "opacity-90 group-hover:opacity-100"
                )}
              />
            </div>
            
            <div className={cn(
              "flex-1 min-w-0 transition-opacity duration-500",
              hasBatches ? "max-w-xl" : ""
            )}>
              <p className={cn(
                "text-slate-300 leading-relaxed font-medium transition-all duration-500",
                hasBatches ? "text-[14px]" : "text-[16px]"
              )}>
                {isDragActive ? "Drop documents here..." : "Drag & drop PDF files, or click to browse."}
              </p>
            </div>
          </div>

          {/* Right part: Buttons */}
          <div className={cn(
            "flex items-center gap-3 shrink-0",
            hasBatches ? "sm:w-auto w-full justify-center sm:justify-end" : "justify-center mt-2"
          )}>
            <Button
              type="button"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="h-11 px-5 font-semibold"
            >
              <FileIcon className="mr-2 h-4 w-4 text-[#888888]" />
              Select Files
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
              className="h-11 px-5 font-semibold"
            >
              <Folder className="mr-2 h-4 w-4 text-[#888888]" />
              Select Folder
            </Button>
          </div>
        </div>
        
        {isScanning && (
          <div className={cn(
            "absolute flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-2 text-xs font-semibold text-[#e0e0e0] shadow-lg animate-fade-in-up",
             hasBatches ? "bottom-4 left-1/2 -translate-x-1/2" : "bottom-6 left-1/2 -translate-x-1/2"
          )}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1D9E75] opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1D9E75]" />
            </span>
            Scanning directory structure...
          </div>
        )}
      </div>

      {/* Batch List */}
      {hasBatches && (
        <div className="w-full space-y-5 animate-fade-in-up">
          <div className="flex items-center justify-between px-2 pt-2">
            <h4 className="text-base font-display font-semibold text-slate-100 flex items-center gap-2">
              Ready to process 
              <span className="flex h-5 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#141414] px-2 text-[11px] font-bold text-[#1D9E75]">
                {totalFiles}
              </span>
            </h4>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearAll} 
                className="h-8 rounded-lg px-4 text-xs font-semibold text-[#888888] hover:text-[#ff6b6b]"
              >
                Clear all
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {batches.map((batch) => {
              const isExpanded = expandedBatches.has(batch.id);
              const totalItems = batch.files.reduce((sum, f) => sum + (f.itemCount ?? 0), 0);
              const hasErrors = batch.files.some(f => f.status === "error");
              
              return (
                <div 
                  key={batch.id} 
                  className={cn(
                    "group overflow-hidden rounded-lg bg-[#1a1a1a] transition-all duration-300",
                    isExpanded 
                      ? "border border-[#2a2a2a] shadow-[0_8px_30px_rgb(0,0,0,0.32)]" 
                      : "border border-[#2a2a2a] shadow-[0_2px_10px_rgb(0,0,0,0.2)] hover:border-[#1D9E75]/25 hover:shadow-[0_0_20px_rgba(29,158,117,0.06)]"
                  )}
                >
                  <div className="relative flex w-full items-center gap-4 px-6 py-5">
                    <button
                      type="button"
                      onClick={() => toggleBatch(batch.id)}
                      aria-expanded={isExpanded}
                      aria-controls={`batch-panel-${batch.id}`}
                      className="flex min-w-0 flex-1 items-center gap-4 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D9E75]/45 focus-visible:ring-inset"
                    >
                      <div className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border transition-all duration-300",
                        isExpanded
                          ? "border-[#1D9E75] bg-[#1D9E75] text-[#0d0d0d] shadow-[0_0_18px_rgba(29,158,117,0.25)]"
                          : "border-[#2a2a2a] bg-[#141414] text-[#888888] group-hover:border-[#1D9E75]/35 group-hover:text-[#e0e0e0]"
                      )}>
                        <FileText className="h-5 w-5" strokeWidth={2} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h5 className="font-display truncate text-[15px] font-semibold text-slate-100">
                          {batch.name}
                        </h5>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-medium text-slate-400">
                            {batch.files.length} document{batch.files.length !== 1 ? "s" : ""}
                          </span>
                          {totalItems > 0 && (
                            <>
                              <span className="text-slate-600 text-[10px]">•</span>
                              <span className="text-xs font-medium tracking-tight text-emerald-300">
                                {totalItems} items extracted
                              </span>
                            </>
                          )}
                          {hasErrors && (
                            <>
                              <span className="text-slate-600 text-[10px]">•</span>
                              <span className="text-xs font-medium tracking-tight text-rose-300">
                                Contains errors
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0 z-10">
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExtractAll();
                        }}
                        disabled={!canExtract}
                        className={cn(
                          "h-10 px-5 font-display text-sm font-bold tracking-wide",
                          canExtract ? "" : "pointer-events-none border-[#2a2a2a] bg-[#141414] text-[#5c5c5c] shadow-none"
                        )}
                      >
                        {isExtracting ? (
                          <>
                            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-[2.5px] border-[#0d0d0d]/30 border-t-[#0d0d0d]" />
                            Extracting...
                          </>
                        ) : (
                          <>
                            Extract Data
                            <ArrowRight className="ml-2 h-4 w-4" strokeWidth={2.5} />
                          </>
                        )}
                      </Button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBatch(batch.id);
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-[#888888] transition-colors hover:bg-[#2a1212] hover:text-[#ff6b6b]"
                        aria-label={`Remove batch ${batch.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleBatch(batch.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`batch-panel-${batch.id}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#141414] text-[#888888] transition-colors hover:border-[#1D9E75]/30 hover:text-[#1D9E75] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D9E75]/45"
                        aria-label={isExpanded ? `Collapse ${batch.name}` : `Expand ${batch.name}`}
                      >
                        <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", isExpanded ? "rotate-180" : "")} />
                      </button>
                    </div>
                  </div>

                  <div className={cn(
                    "overflow-hidden transition-all duration-500 ease-in-out",
                    isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
                  )} id={`batch-panel-${batch.id}`}>
                    <div className="border-t border-slate-800 bg-slate-950/80 px-6 pb-5 pt-1">
                      <ul className="space-y-2 mt-3">
                        {batch.files.map((f) => (
                          <li
                            key={f.id}
                            className="group/file flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 shadow-sm transition-all hover:border-slate-700 hover:shadow"
                          >
                            <div className="shrink-0 rounded-lg bg-slate-800 p-2">
                              <FileIcon className="h-4 w-4 text-slate-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-sm font-medium tracking-tight text-slate-200">
                                {f.fileName}
                              </p>
                              {f.fileSize && (
                                <p className="mt-0.5 text-xs font-medium text-slate-500">
                                  {formatFileSize(f.fileSize)}
                                </p>
                              )}
                            </div>
                            {f.status === "error" && (
                              <span className="shrink-0 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-300">
                                Failed
                              </span>
                            )}
                            {f.itemCount !== undefined && f.status === "done" && (
                              <span className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                                {f.itemCount} found
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => removeFile(batch.id, f.id)}
                              className="opacity-100 p-3 text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-all shrink-0 sm:opacity-0 sm:group-hover/file:opacity-100"
                              aria-label={`Remove ${f.fileName}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
