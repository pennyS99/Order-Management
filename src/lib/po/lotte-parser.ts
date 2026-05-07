import type { POLineItem } from "./types";

/**
 * LOTTE MART and LOTTE GROSIR PO format (LOTTE Group Indonesia).
 * Same layout for both channels. Differentiate by Supplier ID:
 * - LOTTE MART: Supplier ID starts with 01
 * - LOTTE GROSIR: Supplier ID starts with 04
 */
export function isLottePo(text: string): boolean {
  return (
    /LOTTE\s+(MART|GROSIR)/i.test(text) ||
    /PT\.?\s*LOTTE/i.test(text) ||
    /LOTTE\s+MART\s+INDONESIA|LOTTE\s+GROSIR/i.test(text) ||
    /Lotte\s+Management/i.test(text) ||
    /e-?procurement\.lottemart\.co\.id|e-?bidding\.lottemart\.co\.id/i.test(text) ||
    /Store\s*:\s*.+?\s+RDTX/i.test(text)
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
 * Determine channel from Supplier ID: 01 = LOTTE MART, 04 = LOTTE GROSIR.
 * Searches for patterns: "01XXXX", "04XXXX", Supplier No 01-xxx, 04-xxx, or 16-digit codes with 01/04 at positions 7-8.
 */
export function getLotteChannel(text: string): "LOTTE MART" | "LOTTE GROSIR" {
  // Explicit store/supplier code: 01xxxx or 04xxxx
  if (/\b01\d{4,}/.test(text) || /Supplier\s*No[:\s]*01[\-\d]|Store\s*[Cc]ode[:\s]*01/i.test(text)) {
    return "LOTTE MART";
  }
  if (/\b04\d{4,}/.test(text) || /Supplier\s*No[:\s]*04[\-\d]|Store\s*[Cc]ode[:\s]*04/i.test(text)) {
    return "LOTTE GROSIR";
  }
  // 16-digit format: 26YYMMDDXX... where XX at positions 7-8 = channel (01 or 04)
  const codeMatch = text.match(/\b26\d{2}\d{2}\d{2}(01|04)\d{8,}/);
  if (codeMatch) {
    return codeMatch[1] === "01" ? "LOTTE MART" : "LOTTE GROSIR";
  }
  // Default: if "GROSIR" in text, assume LOTTE GROSIR; else LOTTE MART
  return /GROSIR|LOTTE\s+GROSIR/i.test(text) ? "LOTTE GROSIR" : "LOTTE MART";
}

/**
 * Parse delivery location (store name) from "Store :" in PO header.
 * Same rule for LOTTE MART and LOTTE GROSIR (shared layout).
 * Format: "Store : PT FLOAT OAT INDONESIA SOLO BARU RDTX PLACE..." - store name is everything after supplier, before RDTX/Route.
 * Output format: "LOTTE MART SOLO BARU" or "LOTTE GROSIR SOLO BARU" (channel + full store name, no words cut).
 */
export function parseDeliveryLocation(text: string): string | null {
  const storeMatch = text.match(/Store\s*:\s*(.+?)(?:\s+RDTX|\s+Route|$)/i);
  if (storeMatch) {
    let value = storeMatch[1].trim();
    // Strip supplier ID (01xxxx, 04xxxx) - LOTTE GROSIR may have ID in Store value
    value = value.replace(/\s*(?:04|01)[A-Za-z0-9\-]{4,}\s*/gi, " ").trim();
    // Strip leading order numbers if present
    value = value.replace(/^\s*\d{10,}\s*/i, "").trim();
    // Strip PT FLOAT OAT INDONESIA (supplier name) - LOTTE GROSIR format: "PT. FLOAT OAT INDONESIA (F2-26) MATARAM"
    value = value.replace(/PT\.?\s*FLOAT\s+OAT\s+INDONESIA\s*/gi, "").trim();
    // Strip supplier/contract codes in parentheses e.g. (F2-26)
    value = value.replace(/\s*\([A-Z0-9\-]+\)\s*/gi, " ").trim();
    return value || null;
  }
  const dcMatch = text.match(/(?:DC|Toko|Gudang)[:\s]+([A-Za-z0-9\s\-]+?)(?=\s+Supplier|\s+PO\s+No|\s+Date|$)/i);
  if (dcMatch) return dcMatch[1].trim() || null;
  return null;
}

/**
 * Parse order date from PO.
 */
export function parseOrderDate(text: string): string | null {
  const patterns = [
    /Order\s*Date.*?DD\s+(\d{1,2})\s*-\s*(\w{3})\s*-\s*(\d{4})/i,
    /(?:Order\s*Date|Tanggal\s*Pesan|Tgl\s*Pesan|PO\s*Date)[:\s]*(?:DD\s+)?(\d{1,2})\s*[-/]\s*(\w{3})\s*[-/]\s*(\d{2,4})/i,
    /(?:Order\s*Date|Tanggal|Tgl)[:\s]*(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/,
    /(\d{1,2})[-](\w{3})[-](\d{2})\s*(?:Order|Pesan)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return parseDateMatch(m);
  }
  return null;
}

/**
 * Parse delivery date from PO.
 */
export function parseDeliveryDate(text: string): string | null {
  const patterns = [
    /(?:(?:Planned\s+)?Delivery\s*Date|Tanggal\s*Kirim|Tgl\s*Kirim)[:\s]*(?:DD\s+)?(\d{1,2})\s*[-/]\s*(\w{3})\s*[-/]\s*(\d{2,4})/i,
    /(?:Delivery|Kirim)[:\s]*(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/,
    /(\d{1,2})[-](\w{3})[-](\d{2})\s*(?:Delivery|Kirim)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return parseDateMatch(m);
  }
  return parseOrderDate(text);
}

/**
 * Parse supplier name from PO.
 * LOTTE format: "Supplier : Store : PT FLOAT OAT INDONESIA GANDARIA RDTX" - supplier is "PT FLOAT OAT INDONESIA".
 */
export function parseSupplier(text: string): { supplierName: string; supplierCode: string | null } | null {
  const storeMatch = text.match(/Store\s*:\s*(.+?)\s+RDTX/i);
  if (storeMatch) {
    const value = storeMatch[1].trim();
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const supplierName = words.slice(0, -1).join(" ");
      return { supplierName, supplierCode: null };
    }
  }
  const match = text.match(/(?:Supplier|Vendor|Pemasok)[:\s]+([^\n]+?)(?=\s+PO\s+No|\s+Store|\s+Date|$)/i);
  if (!match) return null;
  const raw = match[1].trim();
  const codeMatch = raw.match(/(\d{2}[\-\d]+)\s*(.+)/);
  if (codeMatch) {
    return { supplierName: codeMatch[2].trim(), supplierCode: codeMatch[1].replace(/\s+/g, "") };
  }
  return { supplierName: raw, supplierCode: null };
}

/**
 * Parse note from bottom of PO (asterisk block like Indomarco).
 */
function parseNotes(text: string): string | null {
  const noteMatch = text.match(/\*\s*([^*]{10,}?)\s*\*/);
  if (!noteMatch) return null;
  const note = noteMatch[1].trim();
  return note.length > 0 ? note : null;
}

export function parseLottePo(text: string): POLineItem[] {
  const items: POLineItem[] = [];
  const retailer = getLotteChannel(text);

  const poMatch = text.match(/(?:NO\.?\s*PO|PO\s*No|Nomor\s*PO|Order\s*No|Purchase\s*Order)[:\s]*([A-Za-z0-9\-_]{7,25})/i);
  const poNumber = poMatch ? poMatch[1].trim() : null;

  const orderDate = parseOrderDate(text);
  const deliveryDate = parseDeliveryDate(text) ?? orderDate;

  const loc = parseDeliveryLocation(text);
  const deliveryLocation = loc ? `${retailer} ${loc}`.toUpperCase() : retailer;

  const supplier = parseSupplier(text);
  const supplierName = supplier?.supplierName ?? null;
  const supplierCode = supplier?.supplierCode ?? null;

  const notes = parseNotes(text);

  // Line items: try LOTTE table format first (internal_code 899... ProductName Category Tax UOM Qty UnitPrice Amount)
  // Product name ends with size/weight (200ML, 200ml, 1 L, 18gr) - capture until then to avoid including category (Milk Dry, Biscuit/Snacks)
  // Include \s*L for liter (e.g. "1 L") - was missing, caused "OATSIDE MILK BARISTA BLEND 1" instead of "1 L"
  // Qty uses (\d{1,5}\.\d{3}) to avoid consuming first digit of unit price when PDF extracts "2.0005,115.00" (no space)
  const lotteTablePattern = /(?:\d{10}\s+)?(899\d{10})\s+(.+?\d+(?:\s*(?:ML|ml|L|l|gr|g|G))?)\s+\w+(?:\s*[\w\/]+)*\s*\w*\s*\d{1,2}\s*\d*\s*\/\s*\w+\s*(\d{1,5}\.\d{3})\s*([\d,]+\.\d{2})\s*([\d,]+\.\d{2})(?:\s*[\d,]+\.\d{2})?/g;
  let lotteMatch;
  while ((lotteMatch = lotteTablePattern.exec(text)) !== null) {
    const productCode = lotteMatch[1];
    const productName = lotteMatch[2].trim();
    const quantity = Math.round(parseFloat(lotteMatch[3].replace(/,/g, "")) || 0);
    const unitPrice = parseFloat(lotteMatch[4].replace(/,/g, "")) || null;
    const totalPrice = parseFloat(lotteMatch[5].replace(/,/g, "")) || null;
    const unit = "CTN";

    if (!productName || /Product\s*Code|Product\s*Name/i.test(productName)) continue;
    if (quantity < 0 || quantity >= 100000) continue;

    items.push({
      po_number: poNumber,
      po_date: orderDate,
      retailer,
      supplier_name: supplierName,
      supplier_code: supplierCode,
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

  // Fallback: catch items when product name doesn't end with ML/gr (e.g. "3x200 ml" with space)
  // Same qty pattern (\d{1,5}\.\d{3}) to handle concatenated "Box2.0005,115.00" from PDF extraction
  const seenCodes = new Set(items.map((i) => i.product_code));
  const fallbackPattern = /(?:\d{10}\s+)?(899\d{10})\s+(.+?)\s+\w+(?:\s*[\w\/]+)*\s*\w*\s*\d{1,2}\s*\d*\s*\/\s*\w+\s*(\d{1,5}\.\d{3})\s*([\d,]+\.\d{2})\s*([\d,]+\.\d{2})(?:\s*[\d,]+\.\d{2})?/g;
  let fallbackMatch;
  while ((fallbackMatch = fallbackPattern.exec(text)) !== null) {
    if (seenCodes.has(fallbackMatch[1])) continue;
    const productName = fallbackMatch[2].trim();
    if (productName.length < 4 || /^Product\s*Code|^Product\s*Name|^Milk\s+Dry$|^Biscuit\/Snacks$/i.test(productName)) continue;
    const quantity = Math.round(parseFloat(fallbackMatch[3].replace(/,/g, "")) || 0);
    if (quantity < 0 || quantity >= 100000) continue;
    items.push({
      po_number: poNumber,
      po_date: orderDate,
      retailer,
      supplier_name: supplierName,
      supplier_code: supplierCode,
      delivery_location: deliveryLocation,
      delivery_date: deliveryDate,
      product_code: fallbackMatch[1],
      product_name: productName || null,
      quantity,
      unit: "CTN",
      unit_price: parseFloat(fallbackMatch[4].replace(/,/g, "")) || null,
      total_price: parseFloat(fallbackMatch[5].replace(/,/g, "")) || null,
      discount: null,
      tax: null,
      notes,
    });
  }

  if (items.length > 0) return items;

  // Line items: try Indomarco-style inline (PLU NAME CODE QTY prices)
  const inlinePattern = /(\d{8})\s+(.+?)\s+(\d{7,8})\s+(\d+)\s+\d+\s+([\d,]+\.\d{2})(?:[\s\d,\.\-%]*?)([\d,]+\.\d{2})\s*(?:DISC:|TOTAL|$)/g;
  let inlineMatch;
  while ((inlineMatch = inlinePattern.exec(text)) !== null) {
    const productCode = inlineMatch[1];
    const productName = inlineMatch[2].replace(/\s+(?:[A-Z]{2}\s+)?CTN\/\d+\s*$/, "").trim();
    const quantity = parseInt(inlineMatch[4], 10);
    const unitPrice = parseFloat(inlineMatch[5].replace(/,/g, "")) || null;
    const totalPrice = parseFloat(inlineMatch[6].replace(/,/g, "")) || null;

    if (!productName || /^DISC:|TOTAL|PLU\s*\||Merk\s+&/i.test(productName)) continue;
    if (quantity < 0 || quantity >= 100000) continue;

    const unit = "CTN";

    items.push({
      po_number: poNumber,
      po_date: orderDate,
      retailer,
      supplier_name: supplierName,
      supplier_code: supplierCode,
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

  // Fallback: 13-digit barcode (899...) + qty format
  const lines = text.split(/\n/);
  const pluQtyPattern = /^\d{7,8}\s+(\d+)\s+\d+\s+[\d,]+\.\d{2}/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pluNameMatch = line.match(/^(\d{8})\s+(.+)$/) || line.match(/^(899\d{10})\s+(.+)$/);
    if (!pluNameMatch) continue;

    const productCode = pluNameMatch[1];
    const productName = pluNameMatch[2].replace(/\s+(?:[A-Z]{2}\s+)?CTN\/\d+\s*$/, "").trim();
    if (!productName || /^DISC:|TOTAL|PLU\s*\||Merk\s+&/i.test(productName)) continue;

    let quantity: number | null = null;
    let unitPrice: number | null = null;
    let totalPrice: number | null = null;

    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const qtyMatch = nextLine.match(pluQtyPattern) || nextLine.match(/(\d+)\s+[\d,]+\.\d{2}/);
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

    const unit = "CTN";

    items.push({
      po_number: poNumber,
      po_date: orderDate,
      retailer,
      supplier_name: supplierName,
      supplier_code: supplierCode,
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
