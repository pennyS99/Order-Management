import type { SavedPlanOverlapRef } from "@/types/planner";

/**
 * One (DC, PLD) cell that exists on a saved plan's shipment.
 * Mirrored from the API/server response shape so client and server share the same type.
 */
export interface DcPldIndexEntry {
  /** DC name, exactly as it appears on the saved plan order line. */
  dcName: string;
  /** ISO `YYYY-MM-DD` Plan Loading Date. */
  pld: string;
  planId: string;
  planName: string;
  shipmentId: string;
}

/**
 * Single source of truth for the DC+PLD lookup key. Lowercased + trimmed DC, exact ISO PLD,
 * separated by `|` (DC names cannot contain `|` in the masters spec).
 */
export function dcPldKey(dcName: string, pldIso: string): string {
  return `${dcName.trim().toLocaleLowerCase()}|${pldIso.trim()}`;
}

/**
 * Build a `(dcName, pld)` -> overlap refs map from a list of index entries.
 * Pure helper used by both the server consolidate route and the client fallback path so
 * the engine sees the same map shape regardless of where the input came from.
 */
export function buildDcPldIndex(entries: DcPldIndexEntry[]): Map<string, SavedPlanOverlapRef[]> {
  const out = new Map<string, SavedPlanOverlapRef[]>();
  for (const entry of entries) {
    const dcName = entry.dcName?.trim() ?? "";
    const pld = entry.pld?.trim() ?? "";
    if (!dcName || !pld) continue;
    const key = dcPldKey(dcName, pld);
    const ref: SavedPlanOverlapRef = {
      planId: entry.planId,
      planName: entry.planName,
      shipmentId: entry.shipmentId,
    };
    const list = out.get(key);
    if (list) {
      // Keep refs unique per saved-plan shipment id within a single key.
      if (!list.some((existing) => existing.shipmentId === ref.shipmentId && existing.planId === ref.planId)) {
        list.push(ref);
      }
    } else {
      out.set(key, [ref]);
    }
  }
  return out;
}
