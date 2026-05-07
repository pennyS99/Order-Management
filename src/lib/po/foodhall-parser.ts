import type { POLineItem } from "./types";
import { normalizeUom } from "./uom";

/**
 * FOODHALL PO format (SWALAYAN SUKSES ABADI PT - Food Hall / Ranch Market).
 * Layout: Purchase Order with 10-digit PO number, DC GI delivery, DD.MM.YYYY dates.
 * Line items: NoArticle + ArticleCode + SKU (899... or PF899...) + Description + Country of Origin + Qty + UoM + prices.
 */

export function isFoodhallPo(text: string): boolean {
  return (
    /SWALAYAN\s+SUKSES\s+ABADI\s+PT/i.test(text) ||
    (/Purchase\s*Order/i.test(text) && /Send\s*To\s*:\s*DC\s+GI/i.test(text) && /Country\s+of\s+Origin\s*:\s*Indonesia/i.test(text))
  );
}

/**
 * Parse DD.MM.YYYY to DD/MM/YYYY (Food Hall uses dots).
 */
function parseDotDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, d, mon, y] = m;
  return `${d.padStart(2, "0")}/${mon.padStart(2, "0")}/${y}`;
}

export function parseOrderDate(text: string): string | null {
  const m = text.match(/PO\s*Date\s*:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
  return m ? parseDotDate(m[0]) : null;
}

export function parseDeliveryDate(text: string): string | null {
  const m = text.match(/Delivery\s*:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
  if (m) return parseDotDate(m[0]);
  const expiry = text.match(/Expiry\s*Date\s*:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
  return expiry ? parseDotDate(expiry[0]) : parseOrderDate(text);
}

export function parseDeliveryLocation(text: string): string | null {
  const m = text.match(/Send\s*To\s*:\s*(DC\s+[A-Za-z0-9\s]+?)(?:\s+Jl\.|\s+NPWP|\s+Telephone|$)/i);
  if (m) return m[1].trim() || null;
  return null;
}

function parseSupplier(text: string): string | null {
  const lines = text.split(/\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t && /^[A-Z][A-Za-z\s]+PT\s*$/.test(t) && !/Purchase|Order|SWALAYAN/i.test(t)) {
      return t;
    }
  }
  return null;
}

function parseNotes(text: string): string | null {
  const m = text.match(/Note\s*:\s*([^\n]+?)(?:\s+Phone|\s+Delivery|$)/i);
  return m ? m[1].trim() || null : null;
}

/**
 * Parse Food Hall line items.
 * Format: 00010 37319091 8997240600225 OATSIDE MILK COFFEE 1L/TP Country of Origin : Indonesia 6 EA 000 31,302 28,200 187,812
 * SKU may have PF prefix: PF8997240600348
 * Description can span multiple lines before "Country of Origin : Indonesia".
 */
export function parseFoodhallPo(text: string): POLineItem[] {
  const items: POLineItem[] = [];

  const poMatch = text.match(/Purchase\s*Order\s*\n?\s*(\d{10})/i) ||
    text.match(/(\d{10})\s+SWALAYAN\s+SUKSES/i);
  const poNumber = poMatch ? poMatch[1].trim() : null;

  const orderDate = parseOrderDate(text);
  const deliveryDate = parseDeliveryDate(text) ?? orderDate;
  const loc = parseDeliveryLocation(text);
  const deliveryLocation = loc ? `FOODHALL ${loc}`.toUpperCase() : "FOODHALL";
  const supplierName = parseSupplier(text);
  const notes = parseNotes(text);

  // Primary pattern: NoArticle ArticleCode SKU Description Country of Origin : Indonesia Qty UoM Discount Purc Price Total
  // SKU: (?:PF)?899\d{10}
  // Qty and UoM may be concatenated (6EA) or spaced (6 EA)
  const rowPattern =
    /(\d{5})\s+(\d{8})\s+(?:PF)?(899\d{10})\s+([\s\S]+?)\s+Country\s+of\s+Origin\s*:\s*Indonesia\s+(\d+)\s*(\w+)\s+\d+\s+[\d,]+\.?\d*\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/gi;
  let m;
  while ((m = rowPattern.exec(text)) !== null) {
    const productCode = m[3];
    const productName = m[4]
      .replace(/\s+/g, " ")
      .replace(/\s*\n\s*/g, " ")
      .trim();
    const quantity = parseInt(m[5], 10);
    const rawUom = m[6];
    const unitPrice = parseFloat(m[7].replace(/,/g, "")) || null;
    const totalPrice = parseFloat(m[8].replace(/,/g, "")) || null;

    if (!productName || /^NoArticle|^SKU|^Description|^Qty|^Total$/i.test(productName)) continue;
    if (quantity < 0 || quantity >= 100000) continue;

    items.push({
      po_number: poNumber,
      po_date: orderDate,
      retailer: "FOODHALL",
      supplier_name: supplierName,
      supplier_code: null,
      delivery_location: deliveryLocation,
      delivery_date: deliveryDate,
      product_code: productCode,
      product_name: productName || null,
      quantity,
      unit: normalizeUom(rawUom),
      unit_price: unitPrice,
      total_price: totalPrice,
      discount: null,
      tax: null,
      notes,
    });
  }

  if (items.length > 0) return items;

  // Fallback: simpler pattern when "Country of Origin" is on same line but layout differs
  const fallbackPattern =
    /(?:PF)?(899\d{10})\s+([\s\S]+?)\s+Country\s+of\s+Origin\s*:\s*Indonesia\s+(\d+)\s*(\w+)\s+[\d,]+\.?\d*\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/gi;
  let fm;
  while ((fm = fallbackPattern.exec(text)) !== null) {
    const productCode = fm[1];
    const productName = fm[2].replace(/\s+/g, " ").trim();
    const quantity = parseInt(fm[3], 10);
    const rawUom = fm[4];
    const unitPrice = parseFloat(fm[5].replace(/,/g, "")) || null;
    const totalPrice = parseFloat(fm[6].replace(/,/g, "")) || null;

    if (productName.length < 3 || /^NoArticle|^SKU|^Description$/i.test(productName)) continue;
    if (quantity < 0 || quantity >= 100000) continue;

    items.push({
      po_number: poNumber,
      po_date: orderDate,
      retailer: "FOODHALL",
      supplier_name: supplierName,
      supplier_code: null,
      delivery_location: deliveryLocation,
      delivery_date: deliveryDate,
      product_code: productCode,
      product_name: productName || null,
      quantity,
      unit: normalizeUom(rawUom),
      unit_price: unitPrice,
      total_price: totalPrice,
      discount: null,
      tax: null,
      notes,
    });
  }

  return items;
}
