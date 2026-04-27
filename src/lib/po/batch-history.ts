import type { BatchHistoryEntry, POLineItem } from "./types";

const STORAGE_KEY = "po-extractor-batch-history";
const MAX_ENTRIES = 50;

export function getBatchHistory(): BatchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBatchToHistory(
  batchName: string,
  fileCount: number,
  data: POLineItem[]
): void {
  if (typeof window === "undefined") return;
  try {
    const history = getBatchHistory();
    const entry: BatchHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      batchName,
      fileCount,
      itemCount: data.length,
      completedAt: Date.now(),
      data,
    };
    const updated = [entry, ...history].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

export function removeBatchFromHistory(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const history = getBatchHistory().filter((e) => e.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore
  }
}

export function clearBatchHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
