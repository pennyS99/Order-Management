import { NextRequest, NextResponse } from "next/server";
import { extractPdfText } from "@/lib/po/pdf-extractor";
import { isAeonPo, parseAeonPo } from "@/lib/po/aeon-parser";
import { isIndomarcoPo, parseIndomarcoPo, parseDeliveryLocation, parseDeliveryDate } from "@/lib/po/indomarco-parser";
import { isAlfamartAlfamidiPo, parseAlfamartAlfamidiPo } from "@/lib/po/alfamart-alfamidi-parser";
import { isLottePo, parseLottePo } from "@/lib/po/lotte-parser";
import { isFoodhallPo, parseFoodhallPo } from "@/lib/po/foodhall-parser";
import { extractHariHariPO } from "@/lib/po/extractors/harihari";
import { config } from "@/lib/po/config";
import { normalizeUom, convertToCtn, getItemFromUomMaster } from "@/lib/po/uom";
import { isHariHariPo } from "@/lib/po/utils";
import type { ExtractionMetadata, POLineItem } from "@/lib/po/types";

export const maxDuration = 120;

function shouldUseHariHariExtractor(text: string): boolean {
  return (
    isHariHariPo(text) ||
    /Pulcha\w*\s*Order/i.test(text) ||
    /Dipesan\s*Qty/i.test(text) ||
    /NO\s*SUPPLIER/i.test(text) ||
    /TGL\s*KADALUWARSA/i.test(text) ||
    /BARANG\s+YANG\s+DIKIRIM\s+TANPA\s+DIPESAN/i.test(text)
  );
}

export async function POST(request: NextRequest) {
  console.log("[extract] Request received");
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No PDF file provided" },
        { status: 400 }
      );
    }

    const maxSize = config.upload.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          success: false,
          error: `File too large. Max size: ${config.upload.maxFileSizeMb}MB`,
        },
        { status: 400 }
      );
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
      console.error("[extract] PDF error:", pdfErr);
      return NextResponse.json(
        { success: false, error: `PDF extraction failed: ${msg}` },
        { status: 500 }
      );
    }

    let data: POLineItem[] = [];
    let parserUsed: string | undefined;
    const isScanned = metadata.method === "ocr" || metadata.method === "mixed";

    if (isAlfamartAlfamidiPo(text)) {
      parserUsed = "alfamart-alfamidi";
      data = parseAlfamartAlfamidiPo(text);
      if (data.length === 0) {
        return NextResponse.json(
          { success: false, error: "Alfamart/Alfamidi PO format detected but no line items could be extracted." },
          { status: 422 }
        );
      }
    } else if (isIndomarcoPo(text)) {
      parserUsed = "indomarco";
      data = parseIndomarcoPo(text);
      if (data.length === 0) {
        return NextResponse.json(
          { success: false, error: "Indogrosir/Indomarco PO format detected but no line items could be extracted." },
          { status: 422 }
        );
      }
    } else if (isAeonPo(text)) {
      parserUsed = "aeon";
      data = parseAeonPo(text);
      if (data.length === 0) {
        return NextResponse.json(
          { success: false, error: "AEON PO format detected but no line items could be extracted." },
          { status: 422 }
        );
      }
    } else if (isLottePo(text)) {
      parserUsed = "lotte";
      data = parseLottePo(text);
      if (data.length === 0) {
        return NextResponse.json(
          { success: false, error: "LOTTE MART/LOTTE GROSIR PO format detected but no line items could be extracted." },
          { status: 422 }
        );
      }
    } else if (isFoodhallPo(text)) {
      parserUsed = "foodhall";
      data = parseFoodhallPo(text);
      if (data.length === 0) {
        return NextResponse.json(
          { success: false, error: "FOODHALL PO format detected but no line items could be extracted." },
          { status: 422 }
        );
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
        return NextResponse.json(
          {
            success: false,
            error: hh.warnings.join(" | ") || "Hari-Hari detected but no items could be extracted.",
          },
          { status: 422 }
        );
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          error: isScanned
            ? "Scanned PDF detected, but no supported parser matched this document."
            : "No supported parser matched this PDF format.",
        },
        { status: 422 },
      );
    }

    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: "No supported parser matched this PDF format." },
        { status: 422 }
      );
    }

    // Fill missing PO number from raw extracted text (do not override parser output).
    if (text && data.length > 0) {
      let correctPo: string | null = null;
      const hasMissingPoNumber = data.some((item) => !item.po_number || !String(item.po_number).trim());
      if (hasMissingPoNumber) {
        if (!correctPo) {
          const poMatch = text.match(
            /(?:PO\s*No|NO\.?\s*PO|Nomor\s*PO|No\.?\s*PO|Nomor\s*FPP)\s*[:\-]?\s*([A-Za-z0-9\-_]{6,25})/i
          );
          if (poMatch?.[1]) {
            correctPo = poMatch[1].trim();
          }
        }
        if (!correctPo && isFoodhallPo(text)) {
          const fhMatch = text.match(/Purchase\s*Order\s*\n?\s*(\d{8,14})/i);
          if (fhMatch?.[1]) correctPo = fhMatch[1];
        }
      }
      if (correctPo) {
        data = data.map((item) =>
          !item.po_number || !String(item.po_number).trim()
            ? { ...item, po_number: correctPo }
            : item
        );
      }
      if (/MERCHANDISING\s+INDOMARCO|KRM KE\s*:|PT\.\s*INTI\s+CAKRAWALA|PT\.\s*INDOMARCO\s+PRISMATAMA/i.test(text)) {
        const loc = parseDeliveryLocation(text);
        const deliveryDate = parseDeliveryDate(text);
        if (loc || deliveryDate) {
          data = data.map((item) => ({
            ...item,
            ...(loc && { delivery_location: `${loc.channel} ${loc.dcName}`.toUpperCase() }),
            ...(deliveryDate && { delivery_date: deliveryDate }),
          }));
        }
      }
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

    return NextResponse.json({
      success: true,
      data,
      metadata: {
        ...metadata,
        itemCount: data.length,
        parserUsed,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    console.error("[extract] Error:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
