import { NextResponse } from "next/server";

import { listSavedPlanPoIndex, listSavedPurchaseOrders } from "@/lib/savedPlansStore";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const excludeRaw = searchParams.get("excludePlanId")?.trim();
    const excludePlanId = excludeRaw ? excludeRaw : undefined;

    const [poSet, entries] = await Promise.all([
      listSavedPurchaseOrders(excludePlanId ? { excludePlanId } : undefined),
      listSavedPlanPoIndex(excludePlanId ? { excludePlanId } : undefined),
    ]);

    return NextResponse.json({
      purchaseOrders: Array.from(poSet),
      entries,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load saved PO index." }, { status: 500 });
  }
}
