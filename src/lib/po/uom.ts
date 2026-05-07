/**
 * Standardize UOM (Unit of Measure) across all parsers.
 * Maps variants like CARTON, CTN/24, BOX, KARTON, etc. to canonical forms.
 */
import fs from "node:fs";
import path from "node:path";

const CTN_VARIANTS = [
  /^CTN(\/\d+)?$/i,
  /^CARTON$/i,
  /^BOX$/i,
  /^KARTON$/i,
  /^KRT$/i,
  /^CRT$/i,
];

const PCS_VARIANTS = [/^PCS$/i, /^UNIT$/i, /^EA$/i, /^PCE$/i];

const PACK_VARIANTS = [/^PACK$/i, /^PK$/i];

const BTL_VARIANTS = [/^BTL$/i, /^BOTOL$/i, /^BOTTLE$/i];

export interface UomMasterRow {
  sku: string;
  item: string;
  pcsPerCtn: number;
  packPerCtn: number;
  ctn: number;
}

export const USE_PACK_FOR_PCS_SKUS: string[] = [
  "8997240601239",
  "8997240601253",
  "8997240601246",
  "1010542",
  "1010543",
  "1010544",
  "0930995",
  "4420662",
  "4430152",
  "4430162",
  "20134583",
  "20134584",
  "20134585",
  "134010010",
  "134010011",
  "134010012",
];

function uomMasterFilePath(): string {
  return path.join(process.cwd(), "data", "uom-master.json");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function loadUomMasterSync(): UomMasterRow[] {
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
        const pcsPerCtn = Number(row.pcsPerCtn ?? row.pcs_per_ctn ?? 1);
        const packPerCtn = Number(row.packPerCtn ?? row.pack_per_ctn ?? 1);
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

/** Load UOM master from local JSON file. */
export async function loadUomMaster(): Promise<UomMasterRow[]> {
  return loadUomMasterSync();
}

function shouldUsePackConversion(
  productCode: string | null,
  productName: string | null,
  row: UomMasterRow | null,
): boolean {
  if (!productCode || !row) return false;
  const code = String(productCode).replace(/\s/g, "").replace(/^PF/i, "");
  if (USE_PACK_FOR_PCS_SKUS.includes(code)) return true;
  const stripZeros = (s: string) => s.replace(/^0+/, "") || s;
  if (USE_PACK_FOR_PCS_SKUS.includes(stripZeros(code))) return true;
  if (row.item.endsWith("S3")) return true;
  if (productName && /\bPACK\b/i.test(productName)) return true;
  return false;
}

/**
 * Find UOM master row by product code (SKU).
 * Tries: exact match, strip PF prefix, strip leading zeros.
 */
async function findUomRow(
  productCode: string | null,
  master: UomMasterRow[],
): Promise<UomMasterRow | null> {
  if (!productCode || !master.length) return null;
  const code = String(productCode).replace(/\s/g, "");
  if (!code) return null;

  const exact = master.find((r) => r.sku === code);
  if (exact) return exact;

  const noPrefix = code.replace(/^PF/i, "");
  const noPrefixMatch = master.find((r) => r.sku === noPrefix);
  if (noPrefixMatch) return noPrefixMatch;

  const stripLeadingZeros = (s: string) => s.replace(/^0+/, "") || s;
  const codeNorm = stripLeadingZeros(code);
  return master.find((r) => stripLeadingZeros(r.sku) === codeNorm) ?? null;
}

/**
 * Get ITEM from UOM master by product code (SKU).
 * Returns null if SKU not found.
 */
export async function getItemFromUomMaster(
  productCode: string | null,
  master?: UomMasterRow[],
): Promise<string | null> {
  const m = master ?? loadUomMasterSync();
  const row = await findUomRow(productCode, m);
  return row ? row.item : null;
}

/**
 * Convert quantity to CTN using UOM master.
 * - CTN: no conversion, return as-is.
 * - PCS: qty / PCS/CTN (or PACK/CTN when usePackConversion applies)
 * - PACK: qty / PACK/CTN
 * - Other/unknown: no conversion (return original).
 */
export async function convertToCtn(
  productCode: string | null,
  quantity: number | null,
  unit: string | null,
  master?: UomMasterRow[],
  productName?: string | null,
): Promise<{ quantity: number | null; unit: string }> {
  if (quantity == null || quantity <= 0) return { quantity, unit: unit ?? "CTN" };
  const u = (unit ?? "").trim().toUpperCase();
  if (!u) return { quantity, unit: "CTN" };

  if (CTN_VARIANTS.some((re) => re.test(u))) {
    return { quantity, unit: "CTN" };
  }

  const m = master ?? loadUomMasterSync();
  const row = await findUomRow(productCode, m);
  if (!row) return { quantity, unit: u };

  if (PCS_VARIANTS.some((re) => re.test(u))) {
    const usePack = shouldUsePackConversion(productCode, productName ?? null, row);
    const divisor = usePack
      ? (row.packPerCtn > 0 ? row.packPerCtn : 1)
      : (row.pcsPerCtn > 0 ? row.pcsPerCtn : 1);
    return { quantity: Math.round((quantity / divisor) * 1000) / 1000, unit: "CTN" };
  }
  if (PACK_VARIANTS.some((re) => re.test(u))) {
    const divisor = row.packPerCtn > 0 ? row.packPerCtn : 1;
    return { quantity: Math.round((quantity / divisor) * 1000) / 1000, unit: "CTN" };
  }

  return { quantity, unit: u };
}

/**
 * Normalize raw UOM string to standard output.
 * - CARTON, CTN, CTN/24, BOX, KARTON, etc. → "CTN"
 * - PCS, UNIT, EA → "PCS"
 * - PACK, PK → "PACK"
 * - BTL, BOTOL → "BTL"
 * - Unknown → "CTN" (default for PO context)
 */
export function normalizeUom(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "CTN";
  const trimmed = raw.trim();
  if (!trimmed) return "CTN";

  if (CTN_VARIANTS.some((re) => re.test(trimmed))) return "CTN";
  if (PCS_VARIANTS.some((re) => re.test(trimmed))) return "PCS";
  if (PACK_VARIANTS.some((re) => re.test(trimmed))) return "PACK";
  if (BTL_VARIANTS.some((re) => re.test(trimmed))) return "BTL";

  if (/CTN|CARTON|BOX|KARTON|KRT|CRT/i.test(trimmed)) return "CTN";

  return "CTN";
}

export async function getItemFromUomMasterBySkuLookup(productCode: string | null): Promise<string | null> {
  return getItemFromUomMaster(productCode);
}
