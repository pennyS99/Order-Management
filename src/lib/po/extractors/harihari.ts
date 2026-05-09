import { loadUomMaster } from "@/lib/po/uom";
import { extractTextWithDatalabChandraOcr2 } from "@/lib/po/datalab-ocr";
import { readMasters } from "@/lib/mastersStore";

export type HariHariItem = {
  barcode: string | null;
  description?: string | null;
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

const HARIHARI_TIMEOUT_MS = 110_000;

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

const HARIHARI_MASTERS_PREFIX = "HARIHARI - DC ";
let hariHariDcCandidatesPromise: Promise<string[]> | null = null;

async function getHariHariDcCandidates(): Promise<string[]> {
  if (hariHariDcCandidatesPromise) return hariHariDcCandidatesPromise;
  hariHariDcCandidatesPromise = (async () => {
    const masters = await readMasters();
    const suffixes = masters.addresses
      .map((a) => String(a.dcName ?? "").toUpperCase())
      .filter((name) => name.startsWith(HARIHARI_MASTERS_PREFIX))
      .map((name) => name.slice(HARIHARI_MASTERS_PREFIX.length).trim())
      .filter((s) => s.length > 0);
    return Array.from(new Set(suffixes));
  })().catch(() => {
    hariHariDcCandidatesPromise = null;
    return [];
  });
  return hariHariDcCandidatesPromise;
}

function normDc(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const v0 = new Array(b.length + 1).fill(0).map((_, i) => i);
  const v1 = new Array(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j]!;
  }
  return v0[b.length]!;
}

async function canonicalizeHariHariDcSuffix(suffix: string): Promise<string> {
  const cleaned = suffix.trim();
  if (!cleaned) return "";
  const candidates = await getHariHariDcCandidates();
  if (candidates.length === 0) return cleaned;

  const n = normDc(cleaned);
  if (n.length < 3) return cleaned;

  let best: { cand: string; dist: number } | null = null;
  for (const cand of candidates) {
    const d = levenshtein(n, normDc(cand));
    if (!best || d < best.dist) best = { cand, dist: d };
    if (best.dist === 0) break;
  }
  if (!best) return cleaned;

  // Conservative threshold: allow small OCR slips, but avoid aggressive remapping.
  const maxAllowed = Math.max(1, Math.floor(n.length * 0.2));
  return best.dist <= maxAllowed ? best.cand : cleaned;
}

async function extractDcName(text: string): Promise<string> {
  const normalizeStore = async (raw: string): Promise<string> => {
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
      .replace(/\bTGL\s*KIRIM\b.*$/g, "")
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

    // Canonicalize against masters list (prevents subtle OCR typos, e.g. KALUBATA->KALIBATA).
    // If masters does not contain a close match, we keep the raw cleaned value.
    cleaned = await canonicalizeHariHariDcSuffix(cleaned);

    if (!cleaned) return "";
    return `HARI-HARI DC ${cleaned}`;
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Only accept explicit destination labels (avoid matching "TGL KIRIM").
    if (!/(Diki[rl]m\s*ke|Dikirim\s*ke|Kirim\s*Ke|KRM\s*KE|Tujuan\s*Pengiriman)/i.test(line)) continue;

    const ctx = `${line}\n${lines[i + 1] ?? ""}`;
    // Strip label and keep the first content line
    const afterLabel =
      ctx
        .replace(/.*?(?:Diki[rl]m\s*ke|Dikirim\s*ke|Kirim\s*Ke|KRM\s*KE|Tujuan\s*Pengiriman)\s*[:\-]?\s*/i, "")
        .trim() || (lines[i + 1] ?? "").trim();

    const formatted = await normalizeStore(afterLabel);
    if (formatted) return formatted;
  }

  const patterns = [
    /(?:DC(?:\s*Name)?|Distribution\s*Center)\s*[:\-]\s*([^\n\r]+)/i,
    /(?:Diki[rl]m\s*ke|Dikirim\s*ke|Kirim\s*Ke|KRM\s*KE|Tujuan\s*Pengiriman)\s*[:\-]\s*([^\n\r]+)/i,
    /(?:Diki[rl]m\s*ke|Dikirim\s*ke|Kirim\s*Ke|KRM\s*KE|Tujuan\s*Pengiriman)\s*[:\-]?\s*[^\n\r]*\n([^\n\r]+)/i,
    /\b\d{2,4}\s+([A-Z][A-Z\s]+?)(?=\s+JL\.|\s+JLN|\s+JALAN|\s+ITC|\s+JAKARTA|,|$)/i,
    /ITC\s+([A-Z][A-Z\s]+?)(?=\s+BASEMENT|\s+LT|,|$)/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const formatted = await normalizeStore(m[1]);
      if (formatted) return formatted;
    }
  }
  return "";
}

async function extractItemsFromOcrText(ocrText: string, warnings: string[]): Promise<HariHariItem[]> {
  const items: HariHariItem[] = [];
  const lines = ocrText.split(/\r?\n/);
  const barcodeRegex = /\b(8\d{12})\b/g;

  const normalizeQtyContext = (s: string) =>
    s
      .replaceAll("|", " ")
      .replace(/\*\*/g, " ")
      .replace(/[^\S\r\n]+/g, " ")
      .trim();

  const extractQtyFromContext = (rawContext: string): number => {
    const ctx = normalizeQtyContext(rawContext);

    // Common cases in Datalab markdown tables:
    //   "| 899... | 12 | KTN |"  or  "12 | CTN"
    // Also allow OCR confusions: KTN/K1N/KIN and spaced variants.
    const qtyBeforeUnit = ctx.match(
      /(?:^|\D)(\d{1,6})\s*(?:\|\s*)?(?:K\s*[T1I]\s*N|C\s*T\s*N|KTN|K1N|KIN|CTN)(?:\D|$)/i
    );
    if (qtyBeforeUnit?.[1]) return Number(qtyBeforeUnit[1]);

    // Fallback: if a unit exists nearby, grab the nearest plausible integer.
    if (/(?:K\s*[T1I]\s*N|C\s*T\s*N|KTN|K1N|KIN|CTN)/i.test(ctx)) {
      const ints = Array.from(ctx.matchAll(/(?:^|\D)(\d{1,6})(?:\D|$)/g), (m) => Number(m[1]));
      const plausible = ints.filter((n) => Number.isFinite(n) && n > 0 && n < 100000);
      if (plausible.length > 0) return plausible[plausible.length - 1]!;
    }

    return NaN;
  };

  const extractDescriptionForBarcode = (rawLine: string, barcode: string): string | null => {
    const line = rawLine.trim();
    // Guard: if the "line" is actually the whole document (no real line breaks),
    // do not treat it as a description.
    if (line.length > 220) return null;

    // Prefer markdown table parsing when available.
    if (line.includes("|")) {
      const cells = line
        .split("|")
        .map((c) => c.replace(/\*\*/g, "").trim())
        .filter((c) => c.length > 0);

      const idx = cells.findIndex((c) => c.includes(barcode));
      if (idx !== -1) {
        // Heuristic: description is typically adjacent to barcode cell and is not a pure number/unit.
        const candidates = [cells[idx + 1], cells[idx - 1], cells[idx + 2], cells[idx - 2]].filter(
          (c): c is string => typeof c === "string" && c.trim().length > 0
        );
        for (const c of candidates) {
          const s = c.trim();
          if (/^\d+$/.test(s)) continue;
          if (/^(?:K\s*[T1I]\s*N|C\s*T\s*N|KTN|K1N|KIN|CTN)$/i.test(s.replace(/\s+/g, ""))) continue;
          if (s.length < 3) continue;
          return s;
        }
      }
    }

    // Fallback: remove barcode + qty/unit patterns and keep remaining text.
    const withoutBarcode = line.replace(barcode, " ").replace(/[^\S\r\n]+/g, " ").trim();
    const cleaned = withoutBarcode
      .replace(/(?:^|\D)\d{1,6}\s*(?:K\s*[T1I]\s*N|C\s*T\s*N|KTN|K1N|KIN|CTN)(?:\D|$)/gi, " ")
      .replace(/\b(?:K\s*[T1I]\s*N|C\s*T\s*N|KTN|K1N|KIN|CTN)\b/gi, " ")
      .replace(/\b(?:DIPESAN|QTY|PCS|PACK)\b/gi, " ")
      .replace(/[^\p{L}\p{N}\s\-\/().]/gu, " ")
      .replace(/[^\S\r\n]+/g, " ")
      .trim();

    return cleaned.length >= 3 ? cleaned : null;
  };

  // Build a Set of known SKUs from UOM master for fast lookup
  const master = await loadUomMaster();
  const knownSkus = new Set(master.map((r) => r.sku));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const barcodes = Array.from(line.matchAll(barcodeRegex), (m) => m[1]);
    if (barcodes.length === 0) continue;

    const qtyContext = `${line} ${lines[i + 1] ?? ""} ${lines[i + 2] ?? ""}`;
    const qty = extractQtyFromContext(qtyContext);

    for (const barcode of barcodes) {
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
        description: extractDescriptionForBarcode(line, barcode),
        qty,
        uom: "CTN",
      });
    }
  }

  return items;
}

export async function extractHariHariPO(pdfBuffer: Buffer): Promise<HariHariExtractionResult> {
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
    const apiKey = process.env.DATALAB_API_KEY?.trim();
    if (!apiKey) {
      warnings.push("Missing DATALAB_API_KEY; Hari-Hari extraction requires Datalab OCR.");
      return fallback;
    }

    const { text: fullOcrText } = await extractTextWithDatalabChandraOcr2(pdfBuffer, {
      apiKey,
      timeoutMs: HARIHARI_TIMEOUT_MS,
    });

    const poMatch = fullOcrText.match(/No\s*PO\s*[:\.]?\s*(\d{7,10})/i);
    const poNumber = poMatch?.[1] ?? "";
    if (!poNumber) warnings.push("PO number not found with /No\\s*PO\\s*[:\\.]?\\s*(\\d{7,10})/i.");

    const poDate = extractDateByLabel(fullOcrText, "Tgl Pesan");
    if (!poDate) warnings.push("PO date (Tgl Pesan) not found or invalid format.");

    const deliveryDate = extractDateByLabel(fullOcrText, "Tgl Kadaluwarsa");
    if (!deliveryDate) warnings.push("Delivery date (Tgl Kadaluwarsa) not found or invalid format.");

    const dcName = await extractDcName(fullOcrText);
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
        warnings.push(`EAN-13 checksum failed for barcode ${item.barcode}; raw OCR string: "${rawLine}"`);
      }
    }

    const confidence: "high" | "low" =
      items.length > 0 && warnings.every((w) => !w.includes("EAN-13 checksum failed")) ? "high" : "low";

    return {
      poNumber,
      poDate,
      deliveryDate,
      dcName,
      items,
      confidence,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Extraction error: ${message}`);
    return fallback;
  }
}
