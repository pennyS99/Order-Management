import { NextResponse } from "next/server";
import { getDistanceMatrixForDcs } from "@/lib/consolidation/distanceMatrix";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { dcNames?: unknown };
    const rawDcNames = Array.isArray(payload.dcNames) ? payload.dcNames : [];
    const dcNames = Array.from(
      new Set(
        rawDcNames
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) => value.length > 0),
      ),
    );

    const matrix = await getDistanceMatrixForDcs(dcNames);
    return NextResponse.json({
      distanceEntries: Array.from(matrix.drivingDistanceKm.entries()),
      durationEntries: Array.from(matrix.drivingDurationMin.entries()),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load matrix" }, { status: 500 });
  }
}
