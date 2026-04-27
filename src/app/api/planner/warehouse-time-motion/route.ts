import { NextResponse } from "next/server";

import { getWarehouseTimeMotionSettings } from "@/lib/warehouseTimeMotion";

export async function GET() {
  try {
    const settings = await getWarehouseTimeMotionSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load Warehouse Time Motion settings";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

