import { NextResponse } from "next/server";

import { searchSavedPlansAcrossAll } from "@/lib/savedPlansStore";
import { buildDcSummaryRows } from "@/lib/planner/dcSummaryRows";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      pld?: string;
      area?: string;
      truckType?: string;
      origin?: string;
      serviceType?: string;
    };

    const result = await searchSavedPlansAcrossAll({
      pld: body?.pld,
      area: body?.area,
      truckType: body?.truckType,
      origin: body?.origin,
      serviceType: body?.serviceType,
    });

    const rows = buildDcSummaryRows(result.shipments).map((r) => ({
      ...r,
      savedPlanName: result.savedPlanNameByShipmentId[r.shipmentId] ?? "",
    }));

    return NextResponse.json({
      shipments: result.shipments,
      dcCoordinates: result.dcCoordinates,
      rows,
    });
  } catch {
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}

