import type { POLineItem } from "./types";
import { normalizeUom } from "./uom";

/**
 * Alfamart and Alfamidi PO format (Alfaria Group).
 * Same layout; company: PT Sumber Alfaria Trijaya = Alfamart (SAT), PT Midi Utama = Alfamidi.
 * - Alfamart: "Palet : PT SUMBER ALFARIA TRIJAYA", DC: "D.C. SAT {location}"
 * - Alfamidi: "Palet : PT MIDI UTAMA INDONESIA", DC: "BRANCH {location}" or "DEPO {location}"
 * - PO Date: Tanggal Pesan (tgl pesan)
 * - Delivery Date: Tanggal Kirim (tgl kirim)
 * - SKU: 13-digit PLU (barcode)
 * - Qty: Q_CRT (Alfamart) or Q_Crt (Alfamidi)
 */
export function isAlfamartAlfamidiPo(text: string): boolean {
  return (
    /PT\s+SUMBER\s+ALFARIA|PT\s+MIDI\s+UTAMA\s+INDONESIA/i.test(text) ||
    /D\.C\.\s*SAT\s+\w+|BRANCH\s+\w+\s*\[|DEPO\s+\w+\s*\[/i.test(text) ||
    /FORMULIR\s+PESANAN\s+PEMBELIAN/i.test(text) ||
    /Nomor\s*FPP\s*:/i.test(text) ||
    /Tanggal\s*Pesan\s*:|Tanggal\s*Kirim\s*:/i.test(text) ||
    /B2B\s+Alfamart|B2B\s+AlfaMidi/i.test(text)
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
 * Parse PO Date from "Tanggal Pesan : DD-MON-YY" or "Tgl Pesan : DD-MON-YY"
 */
function parsePoDate(text: string): string | null {
  const match = text.match(/Tanggal\s*Pesan\s*:\s*(\d{1,2})[-](\w{3})[-](\d{2})/i) ||
    text.match(/Tgl\s*Pesan\s*:\s*(\d{1,2})[-](\w{3})[-](\d{2})/i);
  return match ? parseDateMatch(match) : null;
}

/**
 * Parse Delivery Date from "Tanggal Kirim : DD-MON-YY" or "Tgl Kirim : DD-MON-YY"
 */
function parseDeliveryDate(text: string): string | null {
  const match = text.match(/Tanggal\s*Kirim\s*:\s*(\d{1,2})[-](\w{3})[-](\d{2})/i) ||
    text.match(/Tgl\s*Kirim\s*:\s*(\d{1,2})[-](\w{3})[-](\d{2})/i);
  return match ? parseDateMatch(match) : null;
}

/**
 * Parse DC Name for output format:
 * - Alfamart (PT Sumber Alfaria): "ALFAMART DC {location}" from "D.C. SAT {location}"
 * - Alfamidi (PT Midi Utama): "ALFAMIDI - DC {location}" from "BRANCH {location}[code]" or "DEPO {location} [code]"
 */
function parseDcName(text: string): string | null {
  const isAlfamidi = /PT\s+MIDI\s+UTAMA\s+INDONESIA|B2B\s+AlfaMidi/i.test(text);

  if (isAlfamidi) {
    const branchMatch = text.match(/BRANCH\s+(\w+)\s*\[/i);
    if (branchMatch) return `ALFAMIDI DC ${branchMatch[1]}`;
    const depoMatch = text.match(/DEPO\s+([^\[]+?)\s*\[/i);
    if (depoMatch) return `ALFAMIDI DC DEPO ${depoMatch[1].trim()}`;
    const dcMidiMatch = text.match(/DC\s+MIDI\s+(\w+)(?:\s|$)/i);
    if (dcMidiMatch) return `ALFAMIDI DC ${dcMidiMatch[1]}`;
    return null;
  }

  const satMatch = text.match(/D\.C\.\s*SAT\s+([A-Za-z0-9\s]+?)(?:\s+JL\.?|\s+Mobil|$)/i);
  if (satMatch) {
    let loc = satMatch[1].trim().replace(/([A-Za-z])(\d+)$/, "$1 $2");
    return `ALFAMART DC ${loc}`;
  }
  return null;
}

/**
 * Parse line items. Each item: # N PRODUCT_NAME PLU(13-digit) QTY ...
 * Alfamart/Alfamidi format: "# 1 OATSIDE COFFEE TP 200ML;TPK 8997240600348 300"
 */
function parseLineItems(text: string): Array<{ product_code: string; quantity: number; product_name: string | null }> {
  const bySku = new Map<string, { quantity: number; product_name: string | null }>();

  // Primary: # N NAME PLU QTY format (Alfamart/Alfamidi item rows)
  const hashRowPattern = /#\s*\d+\s+(.+?)\s+(899\d{10})\s+(\d{1,6})\b/g;
  let m;
  while ((m = hashRowPattern.exec(text)) !== null) {
    const productCode = m[2];
    const quantity = parseInt(m[3], 10);
    if (quantity <= 0 || quantity >= 100000) continue;

    let productName = m[1].trim();
    // Skip header rows
    if (/^NO|^NAMA|^BARANG|^PLU|^Q_Crt|^Q_CRT/i.test(productName)) continue;
    if (productName.length < 2) continue;

    const existing = bySku.get(productCode);
    const newQty = (existing?.quantity || 0) + quantity;
    bySku.set(productCode, { quantity: newQty, product_name: productName });
  }

  // Fallback: generic format when # N rows not found (e.g. "1 1 NAME 899... QTY")
  if (bySku.size === 0) {
    const itemPattern = /(?:^|[\n\r])(.*?)\s+(899\d{10})\s+(\d{1,6})\b/g;
    while ((m = itemPattern.exec(text)) !== null) {
      const productCode = m[2];
      const quantity = parseInt(m[3], 10);
      if (quantity <= 0 || quantity >= 100000) continue;

      let productName = m[1].trim();
      productName = productName.replace(/^\d{1,2}\s+\d?\s*/, "").trim();
      productName = productName.replace(/\s+CTN\/\d+\s*$/i, "").trim();
      productName = productName.replace(/\s+(?:Q_CRT|Q_Crt|CTN)\s*$/i, "").trim();
      if (!productName || productName.length < 2) productName = "";
      else if (/^(?:NO|NAMA|BARANG|PLU|Q_CRT|Q_Crt|#|\|)$/i.test(productName)) productName = "";

      const existing = bySku.get(productCode);
      const newQty = (existing?.quantity || 0) + quantity;
      const newName = (productName && productName.length > 1) ? productName : (existing?.product_name ?? null);
      bySku.set(productCode, { quantity: newQty, product_name: newName });
    }
  }

  return Array.from(bySku.entries()).map(([product_code, { quantity, product_name }]) => ({
    product_code,
    quantity,
    product_name: product_name || null,
  }));
}

export function parseAlfamartAlfamidiPo(text: string): POLineItem[] {
  const items: POLineItem[] = [];

  const poMatch = text.match(/Nomor\s*FPP\s*:\s*([A-Za-z0-9\-_]{10,25})/i);
  const poNumber = poMatch ? poMatch[1].trim() : null;

  const poDate = parsePoDate(text);
  const deliveryDate = parseDeliveryDate(text);
  const dcName = parseDcName(text);

  const isAlfamidi = /PT\s+MIDI\s+UTAMA\s+INDONESIA|B2B\s+AlfaMidi/i.test(text);
  const retailer = isAlfamidi ? "Alfamidi" : "Alfamart";

  const supplierMatch = text.match(/Nama\s*Supplier\s*:\s*([^\n\[]+)/i);
  const supplierName = supplierMatch ? supplierMatch[1].trim() : "FLOAT OAT INDONESIA PT";

  const lineItems = parseLineItems(text);

  for (const { product_code, quantity, product_name } of lineItems) {
    items.push({
      po_number: poNumber,
      po_date: poDate,
      retailer,
      supplier_name: supplierName,
      supplier_code: null,
      delivery_location: dcName ? dcName.toUpperCase() : null,
      delivery_date: deliveryDate,
      product_code: product_code,
      product_name: product_name,
      quantity,
      unit: normalizeUom("CTN"),
      unit_price: null,
      total_price: null,
      discount: null,
      tax: null,
      notes: null,
    });
  }

  return items;
}
