"use server";

import fs from "node:fs";
import path from "node:path";
import { type UomMasterRow } from "@/lib/po/uom";

function uomMasterFilePath(): string {
  return path.join(process.cwd(), "data", "uom-master.json");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readUomMasterSync(): UomMasterRow[] {
  const filePath = uomMasterFilePath();
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((r) => {
        const row = asRecord(r);
        const sku = String(row.sku ?? "").trim().replace(/\s/g, "");
        const item = String(row.item ?? "").trim();
        const pcsPerCtn = Number(row.pcsPerCtn ?? 1);
        const packPerCtn = Number(row.packPerCtn ?? 1);
        const ctn = Number(row.ctn ?? 1);
        if (!sku || !item) return null;
        return {
          sku,
          item,
          pcsPerCtn: Number.isFinite(pcsPerCtn) && pcsPerCtn > 0 ? Math.round(pcsPerCtn) : 1,
          packPerCtn: Number.isFinite(packPerCtn) && packPerCtn > 0 ? Math.round(packPerCtn) : 1,
          ctn: Number.isFinite(ctn) && ctn > 0 ? Math.round(ctn) : 1,
        } satisfies UomMasterRow;
      })
      .filter((x): x is UomMasterRow => Boolean(x));
  } catch {
    return [];
  }
}

function writeUomMasterSync(rows: UomMasterRow[]): void {
  const filePath = uomMasterFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const normalized = rows.map((r) => ({
    sku: String(r.sku ?? "").trim().replace(/\s/g, ""),
    item: String(r.item ?? "").trim(),
    pcsPerCtn: Math.max(1, Math.round(Number(r.pcsPerCtn ?? 1))),
    packPerCtn: Math.max(1, Math.round(Number(r.packPerCtn ?? 1))),
    ctn: Math.max(1, Math.round(Number(r.ctn ?? 1))),
  }));
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2) + "\n", "utf8");
}

export async function getUomMasterAction(): Promise<{
  success: boolean;
  data?: UomMasterRow[];
  error?: string;
}> {
  try {
    return { success: true, data: readUomMasterSync() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to read UOM master";
    return { success: false, error: msg };
  }
}

export async function addUomItemAction(formData: FormData): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const sku = String(formData.get("sku") ?? "").trim().replace(/\s/g, "");
    const item = String(formData.get("item") ?? "").trim();
    const pcsPerCtn = parseInt(String(formData.get("pcsPerCtn") ?? "1"), 10);
    const packPerCtn = parseInt(String(formData.get("packPerCtn") ?? "1"), 10);

    if (!sku) return { success: false, error: "SKU is required" };
    if (!item) return { success: false, error: "ITEM is required" };
    if (isNaN(pcsPerCtn) || pcsPerCtn < 1) return { success: false, error: "PCS/CTN must be at least 1" };
    if (isNaN(packPerCtn) || packPerCtn < 1) return { success: false, error: "PACK/CTN must be at least 1" };

    const rows = readUomMasterSync();
    if (rows.some((r) => r.sku === sku)) return { success: false, error: `SKU "${sku}" already exists` };

    rows.push({ sku, item, pcsPerCtn, packPerCtn, ctn: 1 });
    writeUomMasterSync(rows);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add UOM item";
    return { success: false, error: msg };
  }
}

export async function updateUomItemAction(
  originalSku: string,
  updates: { sku: string; item: string; pcsPerCtn: number; packPerCtn: number },
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!updates.sku.trim()) return { success: false, error: "SKU is required" };
    if (!updates.item.trim()) return { success: false, error: "ITEM is required" };

    const orig = originalSku.trim().replace(/\s/g, "");
    const rows = readUomMasterSync();
    const idx = rows.findIndex((r) => r.sku === orig);
    if (idx === -1) return { success: false, error: `SKU "${originalSku}" not found` };

    const newSku = updates.sku.trim().replace(/\s/g, "");
    if (newSku !== orig && rows.some((r) => r.sku === newSku)) {
      return { success: false, error: `SKU "${newSku}" already exists` };
    }

    rows[idx] = {
      sku: newSku,
      item: updates.item.trim(),
      pcsPerCtn: Math.max(1, Math.round(updates.pcsPerCtn)),
      packPerCtn: Math.max(1, Math.round(updates.packPerCtn)),
      ctn: 1,
    };
    writeUomMasterSync(rows);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update UOM item";
    return { success: false, error: msg };
  }
}

export async function deleteUomItemAction(sku: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const before = readUomMasterSync();
    const key = sku.trim().replace(/\s/g, "");
    if (!before.some((r) => r.sku === key)) {
      return { success: false, error: `SKU "${sku}" not found` };
    }
    writeUomMasterSync(before.filter((r) => r.sku !== key));
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete UOM item";
    return { success: false, error: msg };
  }
}

export async function deleteUomItemByIndexAction(index: number): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const rows = [...readUomMasterSync()].sort((a, b) => a.sku.localeCompare(b.sku));
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
      return { success: false, error: "Invalid row index" };
    }
    const sku = rows[index]!.sku;
    const current = readUomMasterSync();
    writeUomMasterSync(current.filter((r) => r.sku !== sku));
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete UOM item";
    return { success: false, error: msg };
  }
}

export async function replaceUomMasterAction(
  rows: Array<{ sku: string; item: string; pcsPerCtn: number; packPerCtn: number }>,
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, error: "No rows found in CSV file" };
    }

    const seen = new Set<string>();
    const normalizedRows: UomMasterRow[] = [];

    for (const row of rows) {
      const sku = String(row.sku ?? "").trim().replace(/\s/g, "");
      const item = String(row.item ?? "").trim();
      const pcsPerCtn = Number(row.pcsPerCtn);
      const packPerCtn = Number(row.packPerCtn);

      if (!sku) return { success: false, error: "Every row must have SKU" };
      if (!item) return { success: false, error: `SKU "${sku}" has empty ITEM` };
      if (!Number.isFinite(pcsPerCtn) || pcsPerCtn < 1) {
        return { success: false, error: `SKU "${sku}" has invalid PCS/CTN` };
      }
      if (!Number.isFinite(packPerCtn) || packPerCtn < 1) {
        return { success: false, error: `SKU "${sku}" has invalid PACK/CTN` };
      }
      if (seen.has(sku)) {
        return { success: false, error: `Duplicate SKU "${sku}" in uploaded CSV` };
      }
      seen.add(sku);

      normalizedRows.push({
        sku,
        item,
        pcsPerCtn: Math.round(pcsPerCtn),
        packPerCtn: Math.round(packPerCtn),
        ctn: 1,
      });
    }

    writeUomMasterSync(normalizedRows);
    return { success: true, count: normalizedRows.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to import UOM master CSV";
    return { success: false, error: msg };
  }
}
