import { NextResponse } from "next/server";

import { getSavedPlansFacets } from "@/lib/savedPlansStore";

export async function GET() {
  try {
    const facets = await getSavedPlansFacets();
    return NextResponse.json({ facets });
  } catch {
    return NextResponse.json({ error: "Failed to load facets." }, { status: 500 });
  }
}

