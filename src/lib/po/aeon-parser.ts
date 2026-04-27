import type { POLineItem } from "./types";
import { normalizeUom } from "./uom";

/**
 * Parse delivery location (store) from "STORE CODE STORE NAME" or "1001 AEON BSD CITY"
 */
export function parseDeliveryLocation(text: string): { storeCode: string; storeName: string } | null {
  // Format: 1001 AEON BSD CITY or 1001 AIN BSD AEON MALL BSD CITY
  const storeMatch = text.match(/(\d{4})\s+(AEON\s+[A-Za-z0-9\s]+?)(?=\s+\d+\s+\d{4}|\s+PURCHASE|\s+LINE|\s+Reprint|$)/i);
  if (!storeMatch) return null;
  const storeName = storeMatch[2].trim().replace(/\d{4,5}$/, "").trim() || storeMatch[2].trim();
  return { storeCode: storeMatch[1], storeName };
}

/**
 * Parse order date from "Order Date Delivery Date" section or VAT line "11.00 09 03 2026 10 03 2026"
 */
export function parseOrderDate(text: string): string | null {
  // VAT line: "11.00 09 03 2026 10 03 2026" = VAT% + Order(DD MM YYYY) + Delivery(DD MM YYYY)
  const vatMatch = text.match(/\d+\.\d{2}\s+(\d{2})\s+(\d{2})\s+(\d{4})\s+(\d{2})\s+(\d{2})\s+(\d{4})/);
  if (vatMatch) return `${vatMatch[1]}/${vatMatch[2]}/${vatMatch[3]}`;
  const ddmmyyMatch = text.match(/Order\s*Date[^\d]*(\d{1,2})\s+(\d{2})\s+(\d{4})/i);
  if (ddmmyyMatch) return `${ddmmyyMatch[1].padStart(2, "0")}/${ddmmyyMatch[2]}/${ddmmyyMatch[3]}`;
  return null;
}

/**
 * Parse delivery date from VAT line or "Delivery Date" section
 */
export function parseDeliveryDate(text: string): string | null {
  // VAT line: "11.00 09 03 2026 10 03 2026" - groups 4,5,6 = delivery DD MM YYYY
  const vatMatch = text.match(/\d+\.\d{2}\s+(\d{2})\s+(\d{2})\s+(\d{4})\s+(\d{2})\s+(\d{2})\s+(\d{4})/);
  if (vatMatch) return `${vatMatch[4]}/${vatMatch[5]}/${vatMatch[6]}`;
  const ddmmyyMatch = text.match(/Delivery\s*Date[^\d]*(\d{1,2})\s+(\d{2})\s+(\d{4})/i);
  if (ddmmyyMatch) return `${ddmmyyMatch[1].padStart(2, "0")}/${ddmmyyMatch[2]}/${ddmmyyMatch[3]}`;
  return parseOrderDate(text);
}

/**
 * Parse supplier from "Supplier No / Contract No Supplier Name" - stop at NET TOTAL
 */
export function parseSupplier(text: string): { supplierName: string; supplierCode: string | null } | null {
  const match = text.match(/(\d+\s*\/\s*[\w\-]+)\s*(PT\s+[A-Za-z\s]+?)(?=\s+NET\s+TOTAL|\s+VAT|\s+Page|$)/i);
  if (!match) return null;
  const supplierName = match[2].trim();
  const supplierCode = match[1].replace(/\s+/g, "");
  return { supplierName, supplierCode };
}

/**
 * Parse AEON barcode line: 08202222899724060002710.000.00...
 * SKU = 899724 (from barcode pos 8-13) + "0" + 60 + 4 digits = 8997240600027
 */
function parseAeonBarcodeLine(line: string): { sku: string; qty: number } | null {
  const beforeDecimal = line.split(/\.0*0\.0*0/)[0] || "";
  const barcode = beforeDecimal.match(/^(\d{14})/)?.[1];
  if (!barcode) return null;
  const rest = beforeDecimal.slice(14).replace(/\D/g, "");
  if (rest.length < 8 || !rest.startsWith("06")) return null;
  const prefix = barcode.slice(8, 14);
  const itemPart = rest.slice(3, 7);
  const qtyStr = rest.length === 9 ? rest.slice(7, 9) : rest.slice(7, 8);
  const sku = prefix + "0" + "60" + itemPart;
  const qty = parseInt(qtyStr, 10);
  return { sku, qty };
}

/**
 * Parse AEON table format: "NO ITEM DESCRIPTION ... ITEM NO ITEM BARCODE ORDER QTY DELIVERY QTY ..."
 * Use ITEM BARCODE (13-digit 899...) as product_code, NOT ITEM NO (8-digit) or SUPPLIER ITEM NO.
 */
function parseAeonTableFormat(text: string): Array<{ productName: string; productCode: string; quantity: number; unitPrice?: number; totalPrice?: number; unit?: string }> {
  const items: Array<{ productName: string; productCode: string; quantity: number; unitPrice?: number; totalPrice?: number; unit?: string }> = [];
  const rowPattern = /(\d{1,2})\s+(.+?)\s+\d+\.\d{2}\s+(CARTON|PCS|BOX|KARTON|BTL)\s+\d+\s+\d{8}\s+(899\d{10})\s+([\d.]+)\s+[\d.]+\s+[-\d,.]+\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/gi;
  let m;
  while ((m = rowPattern.exec(text)) !== null) {
    const productName = m[2].trim();
    const productCode = m[4];
    const orderQty = parseFloat(m[5]);
    const quantity = Math.round(orderQty) || 1;
    const unitPrice = parseFloat(m[6].replace(/,/g, "")) || undefined;
    const totalPrice = parseFloat(m[7].replace(/,/g, "")) || undefined;
    const unit = normalizeUom(m[3] || "CARTON");
    if (productName && !/^TOTAL$/i.test(productName)) {
      items.push({ productName, productCode, quantity, unitPrice, totalPrice, unit });
    }
  }
  return items;
}

/**
 * AEON PO format: SKU from ITEM BARCODE column (13-digit 899...), NOT ITEM NO or SUPPLIER ITEM NO.
 */
export function isAeonPo(text: string): boolean {
  return (
    /PT\.?[\s]*AEON/i.test(text) ||
    /AEON[\s]*INDONESIA/i.test(text) ||
    (/ITEM[\s]*BARCODE/i.test(text) && /DELIVERY[\s]*QTY/i.test(text)) ||
    (/AEON/i.test(text) && /Supplier[\s]*No/i.test(text)) ||
    (/AEON/i.test(text) && /Reprint/i.test(text)) ||
    (/AEON[\s]+[A-Za-z0-9\s]+CITY/i.test(text))
  );
}

export function parseAeonPo(text: string): POLineItem[] {
  const items: POLineItem[] = [];

  // PO number
  const poMatch = text.match(/(?:PO\s*No|NO\.?\s*PO)\s*:?\s*(\d{10,20})/i);
  const poNumber = poMatch ? poMatch[1] : null;

  // Order date, delivery date (Indomarco-style: use exported helpers)
  const orderDate = parseOrderDate(text);
  const deliveryDate = parseDeliveryDate(text) ?? orderDate;

  // Supplier (Indomarco-style: use exported helper, bounded regex)
  const supplier = parseSupplier(text);
  const supplierName = supplier?.supplierName ?? "PT AEON INDONESIA";
  const supplierCode = supplier?.supplierCode ?? null;

  // Delivery location (Indomarco-style: use exported helper)
  const loc = parseDeliveryLocation(text);
  const deliveryLocation = (loc ? loc.storeName : "AEON").toUpperCase();

  const retailer = "AEON";

  // Remark (Notes) - text between "Remark" and "TOTAL DISCOUNT" or supplier contract
  let notes: string | null = null;
  const remarkMatch = text.match(/Remark\s+(.+?)\s+TOTAL\s+DISCOUNT/i);
  if (remarkMatch) {
    const remarkText = remarkMatch[1].trim();
    notes = remarkText.length > 0 ? remarkText : null;
  }

  // Line items: try table format first (Indomarco-style: iterate over matches)
  const tableItems = parseAeonTableFormat(text);
  if (tableItems.length > 0) {
    for (const t of tableItems) {
      items.push({
        po_number: poNumber,
        po_date: orderDate,
        retailer,
        supplier_name: supplierName,
        supplier_code: supplierCode,
        delivery_location: deliveryLocation,
        delivery_date: deliveryDate,
        product_code: t.productCode,
        product_name: t.productName,
        quantity: t.quantity,
        unit: normalizeUom(t.unit ?? "CARTON"),
        unit_price: t.unitPrice ?? null,
        total_price: t.totalPrice ?? null,
        discount: null,
        tax: null,
        notes,
      });
    }
    return items;
  }

  // Fallback: barcode line format (line-by-line like Indomarco)
  const lines = text.split(/\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const rowStart = line.match(/^(\d{1,2})([A-Za-z0-9 \/\-].*)$/);
    if (!rowStart) {
      i++;
      continue;
    }

    let productName = rowStart[2].trim();
    let uom = "CARTON";
    let quantity: number | null = null;
    let productCode: string | null = null;
    let unitPrice: number | null = null;
    let totalPrice: number | null = null;

    const sameLineUom = productName.match(/^(.+?)(\d+\.\d{2})([A-Za-z\/]+)$/);
    if (sameLineUom) {
      productName = sameLineUom[1].trim();
      uom = sameLineUom[3].trim();
      i++;
      if (i < lines.length && /^\d+$/.test(lines[i].trim())) {
        quantity = parseInt(lines[i].trim(), 10);
        i++;
      }
      if (i < lines.length) {
        const parsed = parseAeonBarcodeLine(lines[i]);
        if (parsed) {
          productCode = parsed.sku;
          quantity = parsed.qty;
        }
        const prices = lines[i].match(/[\d,]+\.\d{2}/g);
        if (prices && prices.length >= 2) {
          unitPrice = parseFloat(prices[prices.length - 2].replace(/,/g, "")) || null;
          totalPrice = parseFloat(prices[prices.length - 1].replace(/,/g, "")) || null;
        }
        i++;
      }
    } else {
      i++;
      while (i < lines.length) {
        const next = lines[i];
        const uomMatch = next.match(/(\d+\.\d{2})\s*([A-Za-z\/]+)/i) || next.match(/(\d+\.\d+)([A-Z]+)/);
        if (uomMatch) {
          uom = uomMatch[2].trim();
          i++;
          break;
        }
        if (/^\d{13,}/.test(next) || /^TOTAL/.test(next)) break;
        if (next.trim() && !/^\d+$/.test(next.trim())) {
          productName += " " + next.trim();
        }
        i++;
      }
      if (i >= lines.length) break;
      if (i < lines.length && /^\d+$/.test(lines[i].trim())) i++;
      if (i < lines.length) {
        const parsed = parseAeonBarcodeLine(lines[i]);
        if (parsed) {
          productCode = parsed.sku;
          quantity = parsed.qty;
        }
        const prices = lines[i].match(/[\d,]+\.\d{2}/g);
        if (prices && prices.length >= 2) {
          unitPrice = parseFloat(prices[prices.length - 2].replace(/,/g, "")) || null;
          totalPrice = parseFloat(prices[prices.length - 1].replace(/,/g, "")) || null;
        }
        i++;
      }
    }

    if (!productName || /^TOTAL/.test(productName)) continue;
    if (/^\d+\s*\/\s*[\w\-]+\s*PT\s/i.test(productName) || /Supplier|Contract|NPWP/i.test(productName)) continue;
    if (!productCode) continue;

    items.push({
      po_number: poNumber,
      po_date: orderDate,
      retailer,
      supplier_name: supplierName,
      supplier_code: supplierCode,
      delivery_location: deliveryLocation,
      delivery_date: deliveryDate,
      product_code: productCode,
      product_name: productName.trim() || null,
      quantity,
      unit: normalizeUom(uom),
      unit_price: unitPrice,
      total_price: totalPrice,
      discount: null,
      tax: null,
      notes,
    });
  }

  return items;
}
