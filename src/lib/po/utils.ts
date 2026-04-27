import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const MONTH_ABBR: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/**
 * Parse PO/order date from raw text using common Indonesian PO patterns.
 * Returns DD/MM/YYYY or null.
 */
export function parsePoDateFromText(text: string): string | null {
  if (!text || !text.trim()) return null;

  const toDdMmYyyy = (d: string, m: string, y: string): string => {
    const day = d.padStart(2, "0");
    const mon = m.length === 3 ? (MONTH_ABBR[m.toUpperCase()] ?? "01") : m.padStart(2, "0");
    const year = y.length === 2 ? (parseInt(y, 10) >= 50 ? "19" : "20") + y : y;
    return `${day}/${mon}/${year}`;
  };

  const patterns: Array<{ re: RegExp; fn: (m: RegExpMatchArray) => string }> = [
    // HARI HARI / PT SINARSAHABAT: "Tgl Pesan : 01-MAR-26" (top-right, DD-MON-YY)
    { re: /(?:Tgl\s*Pesan|Tanggal\s*Pesan)\s*:?\s*(\d{1,2})[-](\w{3})[-](\d{2})/i, fn: (m) => toDdMmYyyy(m[1], m[2], m[3]) },
    { re: /(?:Tgl\s*Cetak)\s*:?\s*(\d{1,2})[-](\w{3})[-](\d{2})/i, fn: (m) => toDdMmYyyy(m[1], m[2], m[3]) },
    { re: /(?:PO\s*Date|Order\s*Date|Tanggal\s*Pesan|Tgl\s*Pesan|Tanggal|Tgl)\s*:?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/i, fn: (m) => toDdMmYyyy(m[1], m[2], m[3]) },
    { re: /(?:PO\s*Date|Order\s*Date|Tanggal\s*Pesan|Tgl\s*Pesan)\s*:?\s*(\d{1,2})\s+(\d{2})\s+(\d{4})/i, fn: (m) => toDdMmYyyy(m[1], m[2], m[3]) },
    { re: /(?:PO\s*Date|Order\s*Date|Tanggal|Tgl)\s*:?\s*(\d{1,2})[-](\w{3})[-](\d{2})/i, fn: (m) => toDdMmYyyy(m[1], m[2], m[3]) },
    { re: /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\s*(?:Order|Pesan|PO)/i, fn: (m) => toDdMmYyyy(m[1], m[2], m[3]) },
    { re: /(?:Date|Tanggal)\s*:?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/i, fn: (m) => toDdMmYyyy(m[1], m[2], m[3]) },
    { re: /\d+\.\d{2}\s+(\d{2})\s+(\d{2})\s+(\d{4})\s+\d{2}\s+\d{2}\s+\d{4}/, fn: (m) => toDdMmYyyy(m[1], m[2], m[3]) },
    // Fallback: first DD-MON-YY in document (order date often appears before delivery date)
    { re: /(\d{1,2})[-](\w{3})[-](\d{2})\b/i, fn: (m) => toDdMmYyyy(m[1], m[2], m[3]) },
  ];

  for (const { re, fn } of patterns) {
    const m = text.match(re);
    if (m) return fn(m);
  }
  return null;
}

/**
 * Detect HARI HARI (PT SINARSAHABAT) PO from extracted text.
 * Uses multiple patterns since text extraction varies across PDFs.
 */
export function isHariHariPo(text: string | null): boolean {
  if (!text || !text.trim()) return false;
  const patterns = [
    /HARI\s*HARI/i,
    /PT\s*SINARSAHABAT/i,
    /SINARSAHABAT\s*INTIM/i,
    /\bSINARSAHABAT\b/i,
    /\bINTIMAKMUR\b/i,
    /Dipesan\s*Qty|Dipesan\s+Qty/i,
    /Harga\s*Beli\s*Satuan/i,
    /Dikirim\s+ke\s*:/i,
    /No\s*PO\s*:?\s*\d{6,8}/i, // No PO: 4796310 (6-8 digit format)
  ];
  return patterns.some((re) => re.test(text));
}

/**
 * Parse HARI HARI delivery_location from full address to "HARI-HARI DC {store_name}".
 * Input: "PT SINARSAHABAT INTIMAKMUR, 102 ROXY MAS JL. K.H. Hasyim Ashari ITC ROXY MAS BASEMENT, JAKARTA PUSAT 10150"
 * Output: "HARI-HARI DC ROXY MAS"
 */
export function parseHariHariDeliveryLocation(fullAddress: string | null): string | null {
  if (!fullAddress || !fullAddress.trim()) return null;
  const addr = fullAddress.toUpperCase();
  // Store code + store name: "102 ROXY MAS" or "102 ROXY MAS JL." or "102 ROXY MAS,"
  const storeMatch = addr.match(/\d{2,4}\s+([A-Z][A-Z\s]+?)(?=\s+JL\.|\s+ITC|\s+JAKARTA|,\s*JAKARTA|,|$)/);
  if (storeMatch) {
    const storeName = storeMatch[1].trim();
    if (storeName.length >= 2) return `HARI-HARI DC ${storeName}`;
  }
  // ITC + store name: "ITC ROXY MAS BASEMENT"
  const itcMatch = addr.match(/ITC\s+([A-Z][A-Z\s]+?)(?=\s+BASEMENT|\s+LT|\s+$|,)/);
  if (itcMatch) {
    const storeName = itcMatch[1].trim();
    if (storeName.length >= 2) return `HARI-HARI DC ${storeName}`;
  }
  return null;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getBatchName(): string {
  const now = new Date();
  const d = now.getDate().toString().padStart(2, "0");
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const y = now.getFullYear();
  const h = now.getHours().toString().padStart(2, "0");
  const min = now.getMinutes().toString().padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}
