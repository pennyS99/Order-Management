import fs from "node:fs/promises";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { loadUomMaster } from "@/lib/po/uom";

export type HariHariItem = {
  barcode: string | null;
  qty: number;
  uom: "CTN";
};

export type HariHariExtractionResult = {
  poNumber: string;
  poDate: string;
  deliveryDate: string;
  dcName: string;
  items: HariHariItem[];
  confidence: "high" | "low";
  warnings: string[];
};

const DPI = 300;
const execFileAsync = promisify(execFile);
let hariHariSchedulerPromise: Promise<{
  scheduler: {
    addJob: (job: "recognize", image: Buffer) => Promise<{ data: { text: string } }>;
  };
}> | null = null;

const MONTHS: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

async function getLocalEngLangPath(): Promise<string | null> {
  const root = process.cwd();
  const candidates = [
    path.join(root, "node_modules", "@tesseract.js-data", "eng", "4.0.0"),
    path.join(root, "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int"),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, "eng.traineddata.gz"));
      return candidate;
    } catch {
      // keep trying other candidates
    }
  }

  return null;
}

async function getHariHariScheduler() {
  if (hariHariSchedulerPromise) {
    return hariHariSchedulerPromise;
  }

  hariHariSchedulerPromise = (async () => {
    const { createWorker, createScheduler, PSM } = await import("tesseract.js");
    const scheduler = createScheduler();
    const localEngLangPath = await getLocalEngLangPath();
    const workerCount = Math.min(Math.max(1, os.cpus().length - 1), 4);

    const workers = await Promise.all(
      Array.from({ length: workerCount }, async () => {
        const worker = await createWorker(
          "eng",
          undefined,
          localEngLangPath ? { langPath: localEngLangPath, logger: () => {} } : { logger: () => {} },
        );
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          tessedit_char_whitelist:
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-/:.() ",
        });
        return worker;
      }),
    );

    workers.forEach((worker) => scheduler.addWorker(worker));
    return { scheduler };
  })().catch((err) => {
    hariHariSchedulerPromise = null;
    throw err;
  });

  return hariHariSchedulerPromise;
}

function validateEAN13(barcode: string) {
  if (!/^\d{13}$/.test(barcode)) return false;
  const digits = barcode.split("").map(Number);
  const sum = digits
    .slice(0, 12)
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === digits[12];
}

function repairEAN13(barcode: string): string | null {
  if (!/^\d{13}$/.test(barcode)) return null;
  const digits = barcode.split("").map(Number);
  const sum = digits
    .slice(0, 12)
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const expectedCheckDigit = (10 - (sum % 10)) % 10;

  if (expectedCheckDigit !== digits[12]) {
    // Replace 13th digit with the mathematically correct check digit
    return barcode.slice(0, 12) + expectedCheckDigit;
  }
  return barcode;
}

function parseHariHariDate(raw: string | null): string {
  if (!raw) return "";
  const normalized = raw.trim().toUpperCase().replace(/O/g, "0");
  const m = normalized.match(/^(\d{1,2})-([A-Z]{3})-?(\d{2})$/);
  if (!m) return "";

  const day = m[1].padStart(2, "0");
  const month = MONTHS[m[2]];
  const year = `20${m[3]}`;
  if (!month) return "";
  return `${year}-${month}-${day}`;
}

function normalizeForDateSearch(text: string): string {
  return text
    .replace(/[|]/g, "I")
    .replace(/0(?=[A-Z])/g, "O")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/[’`]/g, "'")
    .replace(/TGI\b/gi, "TGL")
    .replace(/TG1\b/gi, "TGL")
    .replace(/PES4N/gi, "PESAN");
}

function preprocessForOcr(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(170)
    .jpeg({ quality: 85 })
    .toBuffer();
}

function extractDateByLabel(text: string, label: "Tgl Pesan" | "Tgl Kadaluwarsa"): string {
  const normalizedText = normalizeForDateSearch(text);
  const dateRegex = /(\d{1,2}-[A-Za-z]{3}-?[0-9O]{2})/;
  const partialDateRegex = /(\d{1,2}-[A-Za-z]{3})-?\b/i;
  const labelPatterns =
    label === "Tgl Pesan"
      ? [
        /TGL\s*PESAN/i,
        /TG[LI1]\s*PESAN/i,
        /TANGGAL\s*PESAN/i,
        /TGL\s*PE[5S]AN/i,
        /TO[L1I]\s*PESAN/i,
        /G[L1I]\s*PESAN/i,
        /\bPESAN\b/i,
      ]
      : [
        /TGL\s*KADALUWARSA/i,
        /TG[LI1]\s*KADALUWARSA/i,
        /TANGGAL\s*KADALUWARSA/i,
        /KADALUWARSA/i,
        /EXPI(?:RY|RED)?\s*DATE/i,
      ];

  const lines = normalizedText.split(/\r?\n/);
  if (label === "Tgl Pesan") {
    const inferYearFromNearby = (idx: number): string | null => {
      const from = Math.max(0, idx - 3);
      const to = Math.min(lines.length - 1, idx + 3);
      for (let i = from; i <= to; i++) {
        const line = lines[i] ?? "";
        if (!/(KIRIM|KADALUWARSA)/i.test(line)) continue;
        const full = line.match(dateRegex);
        if (full?.[1]) {
          const m = full[1].toUpperCase().replace(/O/g, "0").match(/-(\d{2})$/);
          if (m?.[1]) return m[1];
        }
      }
      return null;
    };

    const pesanLineIndexes: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (labelPatterns.some((p) => p.test(line))) {
        pesanLineIndexes.push(i);
      }
    }

    for (const idx of pesanLineIndexes) {
      const from = Math.max(0, idx - 2);
      const to = Math.min(lines.length - 1, idx + 2);

      // First: try exact/partial date on the Pesan line itself.
      const pesanLine = lines[idx] ?? "";
      const fullOnPesan = pesanLine.match(dateRegex);
      if (fullOnPesan?.[1]) {
        const parsed = parseHariHariDate(fullOnPesan[1]);
        if (parsed) return parsed;
      }
      const partialOnPesan = pesanLine.match(partialDateRegex);
      if (partialOnPesan?.[1]) {
        const yy = inferYearFromNearby(idx);
        if (yy) {
          const parsed = parseHariHariDate(`${partialOnPesan[1]}-${yy}`);
          if (parsed) return parsed;
        }
      }

      for (let i = from; i <= to; i++) {
        const line = lines[i] ?? "";
        if (/(KIRIM|KADALUWARSA|CETAK|NAMA\s+SUPPLIER|ALAMAT)/i.test(line)) continue;
        const m = line.match(dateRegex);
        if (m?.[1]) {
          const parsed = parseHariHariDate(m[1]);
          if (parsed) return parsed;
        }
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i] ?? "";
    const combined = `${current} ${lines[i + 1] ?? ""}`;
    if (labelPatterns.some((p) => p.test(current) || p.test(combined))) {
      const inCurrent = current.match(dateRegex);
      if (inCurrent?.[1]) return parseHariHariDate(inCurrent[1]);
      const inCombined = combined.match(dateRegex);
      if (inCombined?.[1]) return parseHariHariDate(inCombined[1]);
    }
  }

  for (const pattern of labelPatterns) {
    const nearbyRegex = new RegExp(
      `${pattern.source}[\\s\\S]{0,80}?(\\d{1,2}-[A-Za-z]{3}-\\d{2})`,
      "i"
    );
    const nearby = normalizedText.match(nearbyRegex);
    if (nearby?.[1]) return parseHariHariDate(nearby[1]);
  }

  return "";
}

function extractDcName(text: string): string {
  const normalizeStore = (raw: string): string => {
    let cleaned = raw
      .toUpperCase()
      .replace(/\b(PT|CV|TBK)\b.*$/g, "")
      .replace(/\b(JL|JLN|JALAN)\b.*$/g, "")
      .replace(/\b(KOTA|KAB|KABUPATEN|PROVINSI)\b.*$/g, "")
      .replace(/\b(INDONESIA)\b.*$/g, "")
      .replace(/[^\w\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Remove trailing header noise often captured from OCR in Hari-Hari docs.
    cleaned = cleaned
      .replace(/\bNO\s+SUPPLIER\b.*$/g, "")
      .replace(/\bSUPPLIER\b.*$/g, "")
      .replace(/\bTGL\s*CETAK\b.*$/g, "")
      .replace(/\bTGL\s*PESAN\b.*$/g, "")
      .replace(/\bNO\s*PO\b.*$/g, "")
      .replace(/\b\d{1,2}-[A-Z]{3}-?\d{2,4}\b.*$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Drop leading store code digits (e.g. "102 ROXY MAS" -> "ROXY MAS").
    cleaned = cleaned.replace(/^\d{2,6}\s+/, "").trim();

    // Keep only the store name portion when a known marker appears.
    const markerCut = cleaned.match(/^(.*?)(?:\s+NO\s+SUPPLIER|\s+SUPPLIER|\s+TGL\s+CETAK|\s+TGL\s+PESAN|\s+NO\s*PO)\b/i);
    if (markerCut?.[1]) {
      cleaned = markerCut[1].trim();
    }

    if (!cleaned) return "";
    return `HARI-HARI DC ${cleaned}`;
  };

  const patterns = [
    /(?:DC(?:\s*Name)?|Distribution\s*Center)\s*[:\-]\s*([^\n\r]+)/i,
    /(?:Kirim\s*Ke|KRM\s*KE|Tujuan\s*Pengiriman)\s*[:\-]\s*([^\n\r]+)/i,
    /(?:Kirim\s*Ke|KRM\s*KE|Tujuan\s*Pengiriman)\s*[:\-]?\s*[^\n\r]*\n([^\n\r]+)/i,
    /\b\d{2,4}\s+([A-Z][A-Z\s]+?)(?=\s+JL\.|\s+JLN|\s+JALAN|\s+ITC|\s+JAKARTA|,|$)/i,
    /ITC\s+([A-Z][A-Z\s]+?)(?=\s+BASEMENT|\s+LT|,|$)/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const formatted = normalizeStore(m[1]);
      if (formatted) return formatted;
    }
  }
  return "";
}

async function extractItemsFromOcrText(ocrText: string, warnings: string[]): Promise<HariHariItem[]> {
  const items: HariHariItem[] = [];
  const lines = ocrText.split(/\r?\n/);
  const barcodeRegex = /\b(8\d{12})\b/g;

  // Build a Set of known SKUs from UOM master for fast lookup
  const master = await loadUomMaster();
  const knownSkus = new Set(master.map((r) => r.sku));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const barcodes = Array.from(line.matchAll(barcodeRegex), (m) => m[1]);
    if (barcodes.length === 0) continue;

    const qtyContext = `${line} ${lines[i + 1] ?? ""}`;
    const qtyMatches = Array.from(qtyContext.matchAll(/(\d+)\s*K[TI]?N/gi), (m) => Number(m[1]));
    const qty = qtyMatches.length > 0 ? qtyMatches[qtyMatches.length - 1] : NaN;

    for (let barcode of barcodes) {
      if (!Number.isFinite(qty)) {
        warnings.push(`Missing quantity for barcode ${barcode} near line: "${line.trim()}"`);
        continue;
      }

      // Verify barcode against UOM master
      let resolvedBarcode: string | null = barcode;

      if (knownSkus.has(barcode)) {
        // Exact match in UOM master — use as-is
        resolvedBarcode = barcode;
      } else {
        // Step 1: Try EAN-13 check-digit repair
        const repaired = repairEAN13(barcode);
        if (repaired && repaired !== barcode && knownSkus.has(repaired)) {
          warnings.push(`Barcode ${barcode} repaired to ${repaired} (check-digit fix, matched UOM master)`);
          resolvedBarcode = repaired;
        } else {
          // Step 2: Fuzzy single-digit repair — try changing each digit position
          // to find a match in UOM master (catches OCR errors like 8987→8997, 8097→8997)
          let fuzzyMatch: string | null = null;
          const digits = barcode.split("");
          for (let pos = 0; pos < digits.length && !fuzzyMatch; pos++) {
            const original = digits[pos];
            for (let d = 0; d <= 9; d++) {
              const replacement = String(d);
              if (replacement === original) continue;
              digits[pos] = replacement;
              const candidate = digits.join("");
              if (knownSkus.has(candidate)) {
                fuzzyMatch = candidate;
                break;
              }
            }
            digits[pos] = original; // restore for next position
          }

          if (fuzzyMatch) {
            warnings.push(`Barcode ${barcode} fuzzy-repaired to ${fuzzyMatch} (matched UOM master)`);
            resolvedBarcode = fuzzyMatch;
          } else {
            warnings.push(`Barcode ${barcode} not found in UOM master — set to null`);
            resolvedBarcode = null;
          }
        }
      }

      items.push({
        barcode: resolvedBarcode,
        qty,
        uom: "CTN",
      });
    }
  }

  return items;
}

export async function extractHariHariPO(pdfPath: string): Promise<HariHariExtractionResult> {
  const warnings: string[] = [];
  const fallback: HariHariExtractionResult = {
    poNumber: "",
    poDate: "",
    deliveryDate: "",
    dcName: "",
    items: [],
    confidence: "low",
    warnings,
  };

  try {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "harihari-"));
    const prefix = path.join(tempDir, `page-${randomUUID()}`);

    try {
      await execFileAsync("pdftoppm", ["-r", String(DPI), "-jpeg", "-jpegopt", "quality=85", pdfPath, prefix]);
      const files = await fs.readdir(tempDir);
      const pageImages = files
        .filter((name) => name.startsWith(path.basename(prefix)) && name.endsWith(".jpg"))
        .map((name) => path.join(tempDir, name))
        .sort((a, b) => {
          const aNum = Number(a.match(/-(\d+)\.jpg$/)?.[1] ?? "0");
          const bNum = Number(b.match(/-(\d+)\.jpg$/)?.[1] ?? "0");
          return aNum - bNum;
        });

      if (pageImages.length === 0) {
        throw new Error("Rasterization produced no page images.");
      }

      let fullOcrText = "";
      const { scheduler } = await getHariHariScheduler();
      const results = await Promise.all(
        pageImages.map(async (imagePath) => {
          const pageImage = await fs.readFile(imagePath);
          const preprocessed = await preprocessForOcr(pageImage);
          return scheduler.addJob("recognize", preprocessed);
        }),
      );
      fullOcrText = results.map((r) => `\n${r.data.text}\n`).join("");

      const poMatch = fullOcrText.match(/No\s*PO\s*[:\.]?\s*(\d{7,10})/i);
      const poNumber = poMatch?.[1] ?? "";
      if (!poNumber) warnings.push("PO number not found with /No\\s*PO\\s*[:\\.]?\\s*(\\d{7,10})/i.");

      const poDate = extractDateByLabel(fullOcrText, "Tgl Pesan");
      if (!poDate) warnings.push("PO date (Tgl Pesan) not found or invalid format.");

      const deliveryDate = extractDateByLabel(fullOcrText, "Tgl Kadaluwarsa");
      if (!deliveryDate) warnings.push("Delivery date (Tgl Kadaluwarsa) not found or invalid format.");

      const dcName = extractDcName(fullOcrText);
      if (!dcName) warnings.push("DC name not found.");

      const items = await extractItemsFromOcrText(fullOcrText, warnings);
      if (items.length === 0) {
        warnings.push("No line items found from OCR text (possible OCR failure).");
      }

      for (const item of items) {
        if (item.barcode && !validateEAN13(item.barcode)) {
          const rawLine =
            fullOcrText
              .split(/\r?\n/)
              .find((line) => line.includes(item.barcode!))
              ?.trim() ?? item.barcode;
          warnings.push(
            `EAN-13 checksum failed for barcode ${item.barcode}; raw OCR string: "${rawLine}"`
          );
        }
      }

      const confidence: "high" | "low" =
        items.length > 0 && warnings.every((w) => !w.includes("EAN-13 checksum failed"))
          ? "high"
          : "low";

      return {
        poNumber,
        poDate,
        deliveryDate,
        dcName,
        items,
        confidence,
        warnings,
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Extraction error: ${message}`);
    return fallback;
  }
}
