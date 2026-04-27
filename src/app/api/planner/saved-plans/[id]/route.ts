import { NextResponse } from "next/server";

import { deleteSavedPlan, loadSavedPlan, renameSavedPlan, replaceSavedPlan } from "@/lib/savedPlansStore";
import type { SavedPlan } from "@/types/savedPlan";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const plan = await loadSavedPlan(id);
    if (!plan) return NextResponse.json({ error: "Saved plan not found." }, { status: 404 });
    return NextResponse.json({ plan });
  } catch {
    return NextResponse.json({ error: "Failed to load saved plan." }, { status: 500 });
  }
}

export async function PUT(request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json()) as
      | {
          name?: string;
          consolidationResult?: SavedPlan["consolidationResult"];
          inputs?: SavedPlan["inputs"];
          dcCoordinates?: SavedPlan["dcCoordinates"];
        }
      | undefined;

    const result = await replaceSavedPlan(id, {
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
    return NextResponse.json({ error: "Failed to replace saved plan." }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json()) as { name?: string } | undefined;
    const result = await renameSavedPlan(id, body?.name ?? "");
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, existingId: result.existingId },
        { status: result.status },
      );
    }
    return NextResponse.json({ meta: result.meta });
  } catch {
    return NextResponse.json({ error: "Failed to rename saved plan." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const result = await deleteSavedPlan(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete saved plan." }, { status: 500 });
  }
}

