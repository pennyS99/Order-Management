import * as XLSX from "xlsx-js-style";
import type { POLineItem } from "./types";
import type { HeaderConfig } from "./types";
import type { ExportOptions } from "./types";

const PRIMARY_COLOR = "0F2D5E";
const LIGHT_BLUE = "F0F4FF";
const BORDER_COLOR = "B4B4B4";
const LOW_CONFIDENCE_YELLOW = "FFFBEB";

const THIN_BORDER = {
  top: { style: "thin" as const, color: { rgb: BORDER_COLOR } },
  bottom: { style: "thin" as const, color: { rgb: BORDER_COLOR } },
  left: { style: "thin" as const, color: { rgb: BORDER_COLOR } },
  right: { style: "thin" as const, color: { rgb: BORDER_COLOR } },
};

function getActiveHeaders(headers: HeaderConfig[]): HeaderConfig[] {
  return headers
    .filter((h) => h.enabled)
    .sort((a, b) => a.order - b.order);
}

const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Convert DD/MM/YYYY or dd-mmm-yy to Excel serial number (days since 1899-12-30) */
function toExcelSerial(val: string | null): number | null {
  if (!val || typeof val !== "string") return null;
  let d: number, m: number, y: number;
  const slashMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  const dashMatch = val.match(/^(\d{1,2})-([a-z]{3})-(\d{2})$/i);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    d = parseInt(day, 10);
    m = parseInt(month, 10) - 1;
    y = year.length === 2 ? (parseInt(year, 10) >= 50 ? 1900 : 2000) + parseInt(year, 10) : parseInt(year, 10);
  } else if (dashMatch) {
    const [, day, mon, year] = dashMatch;
    d = parseInt(day, 10);
    const mi = MONTH_ABBR.indexOf(mon.toLowerCase());
    if (mi < 0) return null;
    m = mi;
    y = 2000 + parseInt(year, 10);
  } else return null;
  const date = new Date(y, m, d);
  if (isNaN(date.getTime())) return null;
  const epoch = new Date(1899, 11, 30);
  return Math.floor((date.getTime() - epoch.getTime()) / 86400000);
}

export function buildExcelWorkbook(
  data: POLineItem[],
  headers: HeaderConfig[],
  options: ExportOptions
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const activeHeaders = getActiveHeaders(headers);
  const hasVisionData = data.some((r) => r.extraction_method != null || r.confidence != null);

  let headerRow = activeHeaders.map((h) => h.label);
  let dataRows = data.map((row) =>
    activeHeaders.map((h) => {
      const val = row[h.key];
      if (typeof val === "number") return val;
      // Convert date strings (DD/MM/YYYY) to Excel serial for po_date and delivery_date
      if ((h.key === "po_date" || h.key === "delivery_date") && typeof val === "string") {
        const serial = toExcelSerial(val);
        if (serial !== null) return serial;
      }
      return val ?? "";
    })
  );

  if (hasVisionData) {
    headerRow = [...headerRow, "Extraction Method", "Confidence"];
    dataRows = dataRows.map((row, i) => {
      const item = data[i];
      const conf = item?.confidence;
      const confPct = typeof conf === "number" ? `${Math.round(conf * 100)}%` : "";
      return [...(dataRows[i] ?? []), item?.extraction_method ?? "", confPct];
    });
  }

  const allData = [headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(allData);

  if (options.freezeHeader) {
    ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2" };
  }

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  // Header row: bold white text, navy background, borders
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[addr]) continue;
    ws[addr].s = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: { patternType: "solid", fgColor: { rgb: PRIMARY_COLOR } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: THIN_BORDER,
    };
  }

  // Data rows: borders, alternating row color, yellow for low confidence
  for (let R = 1; R <= range.e.r; R++) {
    const rowItem = data[R - 1];
    const lowConfidence = typeof rowItem?.confidence === "number" && rowItem.confidence < 0.6;
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      const headerKey = activeHeaders[C]?.key;
      if (
        headerKey &&
        ["quantity", "unit_price", "total_price", "discount", "tax"].includes(
          headerKey
        )
      ) {
        const num = data[R - 1]?.[headerKey as keyof POLineItem];
        if (typeof num === "number") {
          ws[addr].z = "#,##0";
        }
      }
      if (headerKey && (headerKey === "po_date" || headerKey === "delivery_date")) {
        const cellVal = ws[addr]?.v;
        if (typeof cellVal === "number" && cellVal > 1000) {
          ws[addr].z = "dd-mmm-yy";
        }
      }
      if (headerKey && (headerKey === "po_number" || headerKey === "product_code" || headerKey === "item")) {
        ws[addr].z = "@";
      }
      const isEvenRow = R % 2 === 0;
      const baseFill = isEvenRow
        ? { fill: { patternType: "solid" as const, fgColor: { rgb: LIGHT_BLUE } } }
        : {};
      const lowConfFill = lowConfidence
        ? { fill: { patternType: "solid" as const, fgColor: { rgb: LOW_CONFIDENCE_YELLOW } } }
        : {};
      ws[addr].s = {
        border: THIN_BORDER,
        ...(lowConfidence ? lowConfFill : baseFill),
      };
    }
  }

  const colCount = headerRow.length;
  const colWidths = Array.from({ length: colCount }, (_, i) => {
    let max = 15;
    for (let r = 0; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: i });
      const cell = ws[addr];
      if (cell && cell.v) {
        const len = String(cell.v).length;
        max = Math.min(Math.max(max, len), 50);
      }
    }
    return { wch: max };
  });
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, "All Data");

  if (options.summarySheet) {
    const summaryHeaders = [
      "PO Number",
      "Date",
      "Retailer",
      "Supplier",
      "Total Items",
      "Grand Total",
      ...(hasVisionData ? ["Extraction Method", "Confidence Score"] : []),
    ];
    const summaryData: (string | number)[][] = [
      ["Generated by PO Extractor ID"],
      summaryHeaders,
    ];

    const poGroups = new Map<string, POLineItem[]>();
    for (const item of data) {
      const key = `${item.po_number || ""}_${item.retailer || ""}`;
      if (!poGroups.has(key)) poGroups.set(key, []);
      poGroups.get(key)!.push(item);
    }

    for (const [, items] of Array.from(poGroups)) {
      const first = items[0];
      const totalItems = items.reduce((s, i) => s + (i.quantity || 0), 0);
      const grandTotal = items.reduce((s, i) => s + (i.total_price || 0), 0);
      const conf = first?.confidence;
      const confPct = typeof conf === "number" ? `${Math.round(conf * 100)}%` : "";
      summaryData.push([
        first?.po_number || "",
        first?.po_date || "",
        first?.retailer || "",
        first?.supplier_name || "",
        totalItems,
        grandTotal,
        ...(hasVisionData ? [first?.extraction_method ?? "", confPct] : []),
      ]);
    }

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWs["A1"].s = {
      font: { italic: true, color: { rgb: "666666" } },
    };
    const summaryRange = XLSX.utils.decode_range(summaryWs["!ref"] || "A1");
    for (let R = 1; R <= summaryRange.e.r; R++) {
      for (let C = summaryRange.s.c; C <= summaryRange.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (summaryWs[addr]) {
          summaryWs[addr].s = {
            ...(summaryWs[addr].s || {}),
            border: THIN_BORDER,
          };
        }
      }
    }
    if (summaryRange.e.r >= 1) {
      for (let C = summaryRange.s.c; C <= summaryRange.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: 1, c: C });
        if (summaryWs[addr]) {
          summaryWs[addr].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { patternType: "solid", fgColor: { rgb: PRIMARY_COLOR } },
            alignment: { horizontal: "center", vertical: "center" },
            border: THIN_BORDER,
          };
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
  }

  if (options.perRetailer) {
    const retailers = Array.from(new Set(data.map((r) => r.retailer || "Unknown")));
    for (const retailer of retailers) {
      const filtered = data.filter((r) => (r.retailer || "Unknown") === retailer);
      const sheetName = retailer.slice(0, 31);
      const retailerData = [headerRow, ...filtered.map((row) => {
        const base = activeHeaders.map((h) => row[h.key] ?? "");
        if (hasVisionData) {
          const conf = row.confidence;
          const confPct = typeof conf === "number" ? `${Math.round(conf * 100)}%` : "";
          return [...base, row.extraction_method ?? "", confPct];
        }
        return base;
      })];
      const retailerWs = XLSX.utils.aoa_to_sheet(retailerData);
      const retailerRange = XLSX.utils.decode_range(retailerWs["!ref"] || "A1");
      for (let C = retailerRange.s.c; C <= retailerRange.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: C });
        if (retailerWs[addr]) {
          retailerWs[addr].s = {
            font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
            fill: { patternType: "solid", fgColor: { rgb: PRIMARY_COLOR } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: THIN_BORDER,
          };
        }
      }
      for (let R = 1; R <= retailerRange.e.r; R++) {
        for (let C = retailerRange.s.c; C <= retailerRange.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (retailerWs[addr]) {
            retailerWs[addr].s = {
              border: THIN_BORDER,
              ...(R % 2 === 0
                ? { fill: { patternType: "solid", fgColor: { rgb: LIGHT_BLUE } } }
                : {}),
            };
          }
        }
      }
      XLSX.utils.book_append_sheet(wb, retailerWs, sheetName);
    }
  }

  return wb;
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  const xlsxBuffer = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
  });
  return Buffer.from(xlsxBuffer as ArrayBuffer);
}
