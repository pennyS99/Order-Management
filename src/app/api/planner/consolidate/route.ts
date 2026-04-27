import { NextResponse } from "next/server";
import { getDistanceMatrix } from "@/lib/consolidation/distanceMatrix";
import { loadPlannerRuntimeConfig } from "@/lib/consolidation/plannerRuntimeConfigLoader";
import { runConsolidation } from "@/lib/consolidation/engine";
import {
  buildSavedPlanPoIndexMap,
  listFutureDcPldIndex,
  listSavedPlanPoIndex,
} from "@/lib/savedPlansStore";
import { buildDcPldIndex } from "@/lib/planner/savedPlanOverlap";
import type { PlannerDataState } from "@/types/planner";

function buildMatrixMeta(matrix: {
  drivingDistanceKm: Map<string, number>;
  drivingDurationMin: Map<string, number>;
}) {
  let missingDurationPairs = 0;
  for (const key of matrix.drivingDistanceKm.keys()) {
    if (!matrix.drivingDurationMin.has(key)) missingDurationPairs += 1;
  }
  const loaded = matrix.drivingDistanceKm.size > 0 || matrix.drivingDurationMin.size > 0;
  return {
    loaded,
    distancePairs: matrix.drivingDistanceKm.size,
    durationPairs: matrix.drivingDurationMin.size,
    missingDurationPairs,
  };
}

interface ConsolidateRequestBody extends PlannerDataState {
  /** Saved-plan id currently loaded into the live planner; excluded from both saved-plan
   *  indexes so a hydrate-and-rerun never matches the loaded plan against itself. */
  excludePlanId?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConsolidateRequestBody;
    if (!body || !Array.isArray(body.rawOrders)) {
      return NextResponse.json({ error: "Invalid planner payload" }, { status: 400 });
    }
    const { excludePlanId, ...data } = body;
    const exclude = typeof excludePlanId === "string" && excludePlanId.trim().length > 0
      ? excludePlanId.trim()
      : undefined;

    const planner = loadPlannerRuntimeConfig();
    const matrix = getDistanceMatrix();
    const [poEntries, dcPldEntries] = await Promise.all([
      listSavedPlanPoIndex(exclude ? { excludePlanId: exclude } : undefined),
      listFutureDcPldIndex(exclude ? { excludePlanId: exclude } : undefined),
    ]);
    const savedPlanPoIndex = buildSavedPlanPoIndexMap(poEntries);
    const savedPlanDcPldIndex = buildDcPldIndex(dcPldEntries);

    const result = runConsolidation(data, {
      drivingDistanceKm: matrix.drivingDistanceKm,
      drivingDurationMin: matrix.drivingDurationMin,
      planner,
      savedPlanPoIndex,
      savedPlanDcPldIndex,
    });
    const matrixMeta = buildMatrixMeta(matrix);
    console.info(
      `[planner/consolidate] matrix loaded=${matrixMeta.loaded} distancePairs=${matrixMeta.distancePairs} durationPairs=${matrixMeta.durationPairs} missingDurationPairs=${matrixMeta.missingDurationPairs} savedPoEntries=${poEntries.length} savedDcPldEntries=${dcPldEntries.length} excludePlanId=${exclude ?? "<none>"}`,
    );
    return NextResponse.json({
      ...result,
      meta: {
        matrix: matrixMeta,
      },
    });
  } catch {
    return NextResponse.json({ error: "Consolidation failed" }, { status: 500 });
  }
}
