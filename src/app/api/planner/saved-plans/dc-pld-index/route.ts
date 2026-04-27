import { NextResponse } from "next/server";

import { listFutureDcPldIndex } from "@/lib/savedPlansStore";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const excludeRaw = searchParams.get("excludePlanId")?.trim();
    const excludePlanId = excludeRaw ? excludeRaw : undefined;
    const entries = await listFutureDcPldIndex(
      excludePlanId ? { excludePlanId } : undefined,
    );
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ error: "Failed to load saved DC+PLD index." }, { status: 500 });
  }
}
