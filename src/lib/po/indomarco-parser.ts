import type { POLineItem } from "./types";
import { normalizeUom } from "./uom";

/**
 * Indogrosir and Indomarco PO format (Indomarco Group).
 * Same layout; company: PT. Indomarco Prismatama = Indomarco (IDM), PT. Inti Cakrawala = Indogrosir (IGR).
 * - DC name: "KRM KE: DC CIREBON" (Indomarco) or "KRM KE: INDOGROSIR SUKABUMI" (Indogrosir)
 * - Delivery date: "PO TIDAK BERLAKU LAGI SETELAH TGL DD-MON-YY" or "TGL KIRIM" or "TGL :" (order date)
 */
export function isIndomarcoPo(text: string): boolean {
  return (
    /MERCHANDISING\s+INDOMARCO\s+GROUP/i.test(text) ||
    /KRM KE\s*:/i.test(text) ||
    /PT\.\s*INDOMARCO\s+PRISMATAMA|PT\.\s*INTI\s+CAKRAWALA/i.test(text)
  );
}

const MONTH_MAP: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

function parseDateMatch(m: RegExpMatchArray): string {
  const day = m[1].padStart(2, "0");
  const mon = MONTH_MAP[m[2].toUpperCase()] || "01";
  const yy = m[3];
  const year = yy.length === 2 ? (parseInt(yy, 10) >= 50 ? "19" : "20") + yy : yy;
  return `${day}/${mon}/${year}`;
}

/**
 * Build delivery_location as "CHANNEL DC NAME" (e.g. "Indomarco DC CIREBON", "Indogrosir DC SUKABUMI")
 * Uses full channel names, no hyphens.
 */
export function parseDeliveryLocation(text: string): { channel: string; dcName: string } | null {
  const krmMatch = text.match(/KRM KE[:\s]+([^\n]+)/i);
  if (!krmMatch) return null;

  let raw = krmMatch[1].split(/\s+W\.P/i)[0].trim();
  raw = raw.replace(/\s+\d{4,}\s*$/, "").trim();
  if (!raw) return null;

  // Indogrosir: header has (IGR) or W.P is PT. INTI CAKRAWALA
  const isIndogrosir =
    /\(IGR\)|PT\.\s*INTI\s+CAKRAWALA|W\.P\s*:\s*PT\.\s*INTI\s+CAKRAWALA/i.test(text) ||
    raw.startsWith("INDOGROSIR ");

  const channel = isIndogrosir ? "Indogrosir" : "Indomarco";
  let dcPart: string;

  if (raw.startsWith("INDOGROSIR ")) {
    dcPart = "DC " + raw.replace(/^INDOGROSIR\s+/i, "").trim();
  } else if (raw.startsWith("DC ")) {
    dcPart = raw;
  } else {
    dcPart = "DC " + raw;
  }

  return { channel, dcName: dcPart };
}

/**
 * Extract delivery/expiry date from: "PO TIDAK BERLAKU LAGI SETELAH TGL DD-MON-YY" or "TGL KIRIM" or "TGL : DD-MON-YY"
 */
export function parseDeliveryDate(text: string): string | null {
  const expiryMatch = text.match(/PO\s+TIDAK\s+BERLAKU\s+LAGI\s+SETELAH\s+TGL[^\d]*(\d{1,2})[-](\w{3})[-](\d{2})/i);
  if (expiryMatch) return parseDateMatch(expiryMatch);

  const tglKirimMatch = text.match(/TGL\s*KIRIM[^\d]*(\d{1,2})[-](\w{3})[-](\d{2})/i);
  if (tglKirimMatch) return parseDateMatch(tglKirimMatch);

  const tglMatch = text.match(/TGL\s*:\s*(\d{1,2})[-](\w{3})[-](\d{2})/);
  if (tglMatch) return parseDateMatch(tglMatch);

  return null;
}

function parseOrderDate(text: string): string | null {
  const tglMatch = text.match(/TGL\s*:\s*(\d{1,2})[-](\w{3})[-](\d{2})/);
  return tglMatch ? parseDateMatch(tglMatch) : null;
}

/**
 * Extract note from bottom of PO - text between asterisks (e.g. *TGL 21 MARET 2026, DC LIBUR...*)
 * If no additional note or blank, returns null.
 */
function parseNotes(text: string): string | null {
  const noteMatch = text.match(/\*\s*([^*]{10,}?)\s*\*/);
  if (!noteMatch) return null;
  const note = noteMatch[1].trim();
  return note.length > 0 ? note : null;
}

export function parseIndomarcoPo(text: string): POLineItem[] {
  const items: POLineItem[] = [];

  const poMatch = text.match(/(?:NO\.?\s*PO|PO\s*No)\s*:\s*([A-Za-z0-9\-_]{7,20})/i);
  const poNumber = poMatch ? poMatch[1].trim() : null;

  const loc = parseDeliveryLocation(text);
  const deliveryLocation = loc ? `${loc.channel} ${loc.dcName}`.toUpperCase() : null;
  const retailer = loc?.channel === "Indogrosir" ? "Indogrosir" : "Indomarco";

  const orderDate = parseOrderDate(text);
  const deliveryDate = parseDeliveryDate(text) ?? orderDate;

  const notes = parseNotes(text);

  const supplierMatch = text.match(/FLOAT\s+OAT\s+INDONESIA|([A-Z][A-Za-z\s]+PT\.)/);
  const supplierName = supplierMatch ? "FLOAT OAT INDONESIA PT." : null;

  // Line items: PLU (8 digits) + product name, then code (7-8 digits) + qty + prices
  const lines = text.split(/\n/);
  const pluQtyPattern = /^\d{7,8}\s+(\d+)\s+\d+\s+[\d,]+\.\d{2}/;

  // Try inline format first (PDF extracts as single line: PLU NAME CODE QTY 0 prices)
  const inlinePattern = /(\d{8})\s+(.+?)\s+(\d{7,8})\s+(\d+)\s+\d+\s+([\d,]+\.\d{2})(?:[\s\d,\.\-%]*?)([\d,]+\.\d{2})\s*(?:DISC:|TOTAL|$)/g;
  let inlineMatch;
  while ((inlineMatch = inlinePattern.exec(text)) !== null) {
    const productCode = inlineMatch[1];
    let productName = inlineMatch[2].replace(/\s+(?:[A-Z]{2}\s+)?CTN\/\d+\s*$/, "").trim();
    const quantity = parseInt(inlineMatch[4], 10);
    const unitPrice = parseFloat(inlineMatch[5].replace(/,/g, "")) || null;
    const totalPrice = parseFloat(inlineMatch[6].replace(/,/g, "")) || null;

    if (!productName || /^DISC:|TOTAL|PLU\s*\||Merk\s+&/i.test(productName)) continue;
    if (quantity < 0 || quantity >= 100000) continue;

    const uomMatch = inlineMatch[2].match(/CTN\/(\d+)/i);
    const unit = normalizeUom(uomMatch ? `CTN/${uomMatch[1]}` : "CTN");

    items.push({
      po_number: poNumber,
      po_date: orderDate,
      retailer,
      supplier_name: supplierName,
      supplier_code: null,
      delivery_location: deliveryLocation,
      delivery_date: deliveryDate,
      product_code: productCode,
      product_name: productName || null,
      quantity,
      unit,
      unit_price: unitPrice,
      total_price: totalPrice,
      discount: null,
      tax: null,
      notes,
    });
  }

  if (items.length > 0) return items;

  // Fallback: line-by-line format (PLU+name on one line, code+qty on next)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pluNameMatch = line.match(/^(\d{8})\s+(.+)$/);
    if (!pluNameMatch) continue;

    const productCode = pluNameMatch[1];
    let productName = pluNameMatch[2].replace(/\s+(?:[A-Z]{2}\s+)?CTN\/\d+\s*$/, "").trim();
    if (!productName || /^DISC:|TOTAL|PLU\s*\||Merk\s+&/i.test(productName)) continue;

    let quantity: number | null = null;
    let unitPrice: number | null = null;
    let totalPrice: number | null = null;

    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const qtyMatch = nextLine.match(pluQtyPattern);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1], 10);
        const prices = nextLine.match(/[\d,]+\.\d{2}/g);
        if (prices && prices.length >= 2) {
          unitPrice = parseFloat(prices[0].replace(/,/g, "")) || null;
          totalPrice = parseFloat(prices[prices.length - 1].replace(/,/g, "")) || null;
        }
      }
    }

    if (!quantity && quantity !== 0) continue;

    const uomMatch = line.match(/CTN\/(\d+)/i);
    const unit = normalizeUom(uomMatch ? `CTN/${uomMatch[1]}` : "CTN");

    items.push({
      po_number: poNumber,
      po_date: orderDate,
      retailer,
      supplier_name: supplierName,
      supplier_code: null,
      delivery_location: deliveryLocation,
      delivery_date: deliveryDate,
      product_code: productCode,
      product_name: productName || null,
      quantity,
      unit,
      unit_price: unitPrice,
      total_price: totalPrice,
      discount: null,
      tax: null,
      notes,
    });
  }

  return items;
}
