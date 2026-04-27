import Link from "next/link";

import { loadSavedPlan } from "@/lib/savedPlansStore";
import { SavedPlanDetailClient } from "@/components/planner/SavedPlanDetailClient";

export default async function SavedPlanDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const plan = await loadSavedPlan(id);

  if (!plan) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="space-y-4">
          <h1 className="font-display text-xl font-black tracking-tight text-[#e0e0e0]">Saved plan not found</h1>
          <p className="text-sm text-[#888888]">The saved plan may have been deleted or moved.</p>
          <Link
            href="/planner/saved"
            className="inline-flex min-h-10 items-center rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-2 text-sm font-semibold text-[#e0e0e0] hover:border-[#1D9E75]/45 hover:text-[#1D9E75]"
          >
            Back to saved plans
          </Link>
        </div>
      </main>
    );
  }

  return <SavedPlanDetailClient plan={plan} />;
}

