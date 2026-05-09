"use server";

import { extractPdfText } from "@/lib/po/pdf-extractor";
import { isAeonPo, parseAeonPo } from "@/lib/po/aeon-parser";
import { isIndomarcoPo, parseIndomarcoPo } from "@/lib/po/indomarco-parser";
import { isAlfamartAlfamidiPo, parseAlfamartAlfamidiPo } from "@/lib/po/alfamart-alfamidi-parser";
import { isLottePo, parseLottePo } from "@/lib/po/lotte-parser";
import { isFoodhallPo, parseFoodhallPo } from "@/lib/po/foodhall-parser";
import { extractHariHariPO } from "@/lib/po/extractors/harihari";
import { config } from "@/lib/po/config";
import { normalizeUom, convertToCtn, getItemFromUomMaster } from "@/lib/po/uom";
import { parsePoDateFromText, parseHariHariDeliveryLocation, isHariHariPo } from "@/lib/po/utils";
import type { ExtractionMetadata, POLineItem } from "@/lib/po/types";

function shouldUseHariHariExtractor(text: string): boolean {
  return (
    isHariHariPo(text) ||
    /Pulcha\w*\s*Order/i.test(text) ||
    /Dipesan\s*Qty/i.test(text) ||
    /NO\s*SUPPLIER(?!\s+NAME)/i.test(text) ||
    /TGL\s*KADALUWARSA/i.test(text) ||
    /BARANG\s+YANG\s+DIKIRIM\s+TANPA\s+DIPESAN/i.test(text)
  );
}

export async function extractPdfAction(formData: FormData): Promise<{
  success: boolean;
  data?: POLineItem[];
  metadata?: ExtractionMetadata & { itemCount: number };
  error?: string;
}> {
  try {
    const file = formData.get("file") as File | null;
    if (!file) {
      return { success: false, error: "No PDF file provided" };
    }

    const maxSize = config.upload.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        success: false,
        error: `File too large. Max size: ${config.upload.maxFileSizeMb}MB`,
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let text: string;
    let metadata: ExtractionMetadata;

    try {
      const pdfResult = await extractPdfText(buffer);
      text = pdfResult.text;
      metadata = pdfResult.metadata;
    } catch (pdfErr) {
      const msg = pdfErr instanceof Error ? pdfErr.message : "PDF extraction failed";
      return { success: false, error: `PDF extraction failed: ${msg}` };
    }

    let data: POLineItem[] = [];
    let parserUsed: string | undefined;

    if ((isAlfamartAlfamidiPo(text))) {
      parserUsed = "alfamart-alfamidi";
      data = parseAlfamartAlfamidiPo(text);
      if (data.length === 0) {
        return {
          success: false,
          error: "Alfamart/Alfamidi PO format detected but no line items could be extracted. The PDF may have an unusual layout.",
        };
      }
    } else if (isIndomarcoPo(text)) {
      parserUsed = "indomarco";
      data = parseIndomarcoPo(text);
      if (data.length === 0) {
        return { success: false, error: "Indogrosir/Indomarco PO format detected but no line items could be extracted." };
      }
    } else if (isAeonPo(text)) {
      parserUsed = "aeon";
      data = parseAeonPo(text);
      if (data.length === 0) {
        return { success: false, error: "AEON PO format detected but no line items could be extracted." };
      }
    } else if (isLottePo(text)) {
      parserUsed = "lotte";
      data = parseLottePo(text);
      if (data.length === 0) {
        return { success: false, error: "LOTTE MART/LOTTE GROSIR PO format detected but no line items could be extracted." };
      }
    } else if (isFoodhallPo(text)) {
      parserUsed = "foodhall";
      data = parseFoodhallPo(text);
      if (data.length === 0) {
        return { success: false, error: "FOODHALL PO format detected but no line items could be extracted." };
      }
    } else if (shouldUseHariHariExtractor(text)) {
      parserUsed = "harihari-datalab";
      const hh = await extractHariHariPO(buffer);

      data = hh.items.map((item) => ({
          po_number: hh.poNumber || null,
          po_date: hh.poDate || null,
          retailer: "Hari-Hari",
          supplier_name: null,
          supplier_code: null,
          delivery_location: hh.dcName || null,
          delivery_date: hh.deliveryDate || null,
          product_code: item.barcode,
          item: null,
          product_name: item.description ?? null,
          quantity: item.qty,
          unit: "CTN",
          unit_price: null,
          total_price: null,
          discount: null,
          tax: null,
          notes: hh.warnings.length > 0 ? hh.warnings.join(" | ") : null,
          extraction_method: "harihari_datalab",
          confidence: hh.confidence === "high" ? 1 : 0,
      }));

      if (data.length === 0) {
        return {
          success: false,
          error: hh.warnings.join(" | ") || "Hari-Hari detected but no items could be extracted.",
        };
      }
    } else {
      const isScanned = metadata.method === "ocr" || metadata.method === "mixed";
      return {
        success: false,
        error: isScanned
          ? "Scanned PDF detected, but no supported parser matched this document."
          : "No supported parser matched this PDF format.",
      };
    }

    if (data.length === 0) {
      return {
        success: false,
        error: "No supported parser matched this PDF format.",
      };
    }

    // Fill missing PO number from raw extracted text (do not override parser output).
    if (text && data.length > 0) {
      let correctPoNumber: string | null = null;
      const hasMissingPoNumber = data.some((item) => !item.po_number || !String(item.po_number).trim());
      if (hasMissingPoNumber) {
        if (!correctPoNumber) {
          const genericMatch = text.match(
            /(?:PO\s*No|NO\.?\s*PO|Nomor\s*PO|No\.?\s*PO|Nomor\s*FPP)\s*[:\-]?\s*([A-Za-z0-9\-_]{6,25})/i
          );
          if (genericMatch) {
            const raw = genericMatch[1]?.trim();
            if (raw) {
              correctPoNumber = raw;
            }
          }
        }
        // Food Hall often presents: "Purchase Order" then number on next line.
        if (!correctPoNumber && isFoodhallPo(text)) {
          const fhMatch = text.match(/Purchase\s*Order\s*\n?\s*(\d{8,14})/i);
          if (fhMatch?.[1]) correctPoNumber = fhMatch[1];
        }
      }
      if (correctPoNumber) {
        data = data.map((item) =>
          !item.po_number || !String(item.po_number).trim()
            ? { ...item, po_number: correctPoNumber }
            : item
        );
      }
      // Fix blank PO date from raw text.
      const hasBlankPoDate = data.some((item) => !item.po_date || !String(item.po_date).trim());
      if (hasBlankPoDate && parserUsed !== "harihari-datalab") {
        const poDateFromText = parsePoDateFromText(text);
        if (poDateFromText) {
          data = data.map((item) => ({ ...item, po_date: poDateFromText }));
        }
      }
      // Fix Indogrosir/Indomarco: overlay DC name with channel and delivery date from PDF text
      if (/MERCHANDISING\s+INDOMARCO|KRM KE\s*:|PT\.\s*INTI\s+CAKRAWALA|PT\.\s*INDOMARCO\s+PRISMATAMA/i.test(text)) {
        const indo = await import("@/lib/po/indomarco-parser");
        const loc = indo.parseDeliveryLocation(text);
        const deliveryDate = indo.parseDeliveryDate(text);
        if (loc || deliveryDate) {
          data = data.map((item) => ({
            ...item,
            ...(loc && { delivery_location: `${loc.channel} ${loc.dcName}`.toUpperCase() }),
            ...(deliveryDate && { delivery_date: deliveryDate }),
          }));
        }
      }
      // Fix AEON: overlay store and dates from PDF text.
      if (isAeonPo(text)) {
        const aeon = await import("@/lib/po/aeon-parser");
        const loc = aeon.parseDeliveryLocation(text);
        const orderDate = aeon.parseOrderDate(text);
        const deliveryDate = aeon.parseDeliveryDate(text);
        if (loc || orderDate || deliveryDate) {
          data = data.map((item) => ({
            ...item,
            ...(loc && { delivery_location: loc.storeName.toUpperCase() }),
            ...(orderDate && { po_date: orderDate }),
            ...(deliveryDate && { delivery_date: deliveryDate }),
          }));
        }
      }
      // Fix LOTTE: overlay store and dates from PDF text.
      if (isLottePo(text)) {
        const lotte = await import("@/lib/po/lotte-parser");
        const loc = lotte.parseDeliveryLocation(text);
        const orderDate = lotte.parseOrderDate(text);
        const deliveryDate = lotte.parseDeliveryDate(text);
        if (loc || orderDate || deliveryDate) {
          data = data.map((item) => ({
            ...item,
            ...(loc && { delivery_location: `${item.retailer} ${loc}`.toUpperCase() }),
            ...(orderDate && { po_date: orderDate }),
            ...(deliveryDate && { delivery_date: deliveryDate }),
          }));
        }
      }
      // Fix FOODHALL: overlay delivery location and dates from PDF text.
      if (isFoodhallPo(text)) {
        const foodhall = await import("@/lib/po/foodhall-parser");
        const loc = foodhall.parseDeliveryLocation(text);
        const orderDate = foodhall.parseOrderDate(text);
        const deliveryDate = foodhall.parseDeliveryDate(text);
        if (loc || orderDate || deliveryDate) {
          data = data.map((item) => ({
            ...item,
            ...(loc && { delivery_location: `FOODHALL ${loc}`.toUpperCase() }),
            ...(orderDate && { po_date: orderDate }),
            ...(deliveryDate && { delivery_date: deliveryDate }),
          }));
        }
      }
      // Fix Alfamart/Alfamidi: overlay DC name and dates from PDF text.
      if (isAlfamartAlfamidiPo(text)) {
        const alf = await import("@/lib/po/alfamart-alfamidi-parser");
        const parsed = alf.parseAlfamartAlfamidiPo(text);
        if (parsed.length > 0) {
          const sample = parsed[0];
          data = data.map((item) => ({
            ...item,
            ...(sample.delivery_location && { delivery_location: sample.delivery_location.toUpperCase() }),
            ...(sample.po_date && { po_date: sample.po_date }),
            ...(sample.delivery_date && { delivery_date: sample.delivery_date }),
          }));
        }
      }
      if (data.some((item) => /HARI\s*HARI/i.test(item.retailer || ""))) {
        data = data.map((item) => {
          const formatted = parseHariHariDeliveryLocation(item.delivery_location);
          return formatted ? { ...item, delivery_location: formatted } : item;
        });
      }
    }

    // Capitalize DC Name, normalize UOM, convert PCS/PACK to CTN, and set ITEM from UOM master
    data = await Promise.all(
      data.map(async (item) => {
        const unit = normalizeUom(item.unit);
        const { quantity, unit: outUnit } = await convertToCtn(
          item.product_code,
          item.quantity,
          unit,
          undefined,
          item.product_name,
        );
        const uomItem = await getItemFromUomMaster(item.product_code);
        return {
          ...item,
          delivery_location: item.delivery_location ? item.delivery_location.toUpperCase() : null,
          quantity,
          unit: outUnit,
          item: uomItem,
        };
      }),
    );

    return {
      success: true,
      data,
      metadata: { ...metadata, itemCount: data.length, parserUsed },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return { success: false, error: message };
  }
}
