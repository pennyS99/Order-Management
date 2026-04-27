import { NextResponse } from "next/server";

import { createSavedPlan, listSavedPlans } from "@/lib/savedPlansStore";
import type { SavedPlan } from "@/types/savedPlan";

export async function GET() {
  try {
    const plans = await listSavedPlans();
    return NextResponse.json({ plans });
  } catch {
    return NextResponse.json({ error: "Failed to load saved plans." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as
      | {
          name?: string;
          consolidationResult?: SavedPlan["consolidationResult"];
          inputs?: SavedPlan["inputs"];
          dcCoordinates?: SavedPlan["dcCoordinates"];
        }
      | undefined;

    const result = await createSavedPlan({
      name: body?.name ?? "",
      consolidationResult: body?.consolidationResult as SavedPlan["consolidationResult"],
      inputs: body?.inputs as SavedPlan["inputs"],
      dcCoordinates: body?.dcCoordinates as SavedPlan["dcCoordinates"],
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, existingId: result.existingId },
        { status: result.status },
      );
    }

    return NextResponse.json({ meta: result.meta });
  } catch {
    return NextResponse.json({ error: "Failed to save plan." }, { status: 500 });
  }
}

