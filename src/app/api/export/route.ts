import { NextRequest, NextResponse } from "next/server";
import { buildExcelWorkbook, workbookToBuffer } from "@/lib/po/excel-builder";
import { loadDefaultHeadersFromRepository } from "@/lib/po/config";
import type { POLineItem } from "@/lib/po/types";
import type { HeaderConfig } from "@/lib/po/types";
import type { ExportOptions } from "@/lib/po/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, headers, options } = body as {
      data: POLineItem[];
      headers: HeaderConfig[];
      options: ExportOptions;
    };

    if (!data || !Array.isArray(data)) {
      return NextResponse.json(
        { success: false, error: "Invalid data" },
        { status: 400 }
      );
    }

    const defaultOptions: ExportOptions = {
      summarySheet: true,
      perRetailer: true,
      freezeHeader: true,
    };
    const mergedOptions = { ...defaultOptions, ...options };

    const defaultHeaders = await loadDefaultHeadersFromRepository();
    const mergedHeaders = (headers?.length ? headers : defaultHeaders) as HeaderConfig[];
    const wb = buildExcelWorkbook(data, mergedHeaders, mergedOptions);
    const buffer = workbookToBuffer(wb);

    // Use local time (UI uses local time); avoid UTC "D-1" filenames near midnight.
    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
    const filename = `PO_Extracted_${timestamp}.xlsx`;

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
