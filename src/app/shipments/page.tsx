import Link from "next/link";

import { ShipmentsSavedPlansTable } from "@/components/planner/ShipmentsSavedPlansTable";
import { buildDcSummaryRows } from "@/lib/planner/dcSummaryRows";
import { searchSavedPlansAcrossAll } from "@/lib/savedPlansStore";

export default async function ShipmentsPage() {
  const result = await searchSavedPlansAcrossAll({});
  const rows = buildDcSummaryRows(result.shipments).map((r) => ({
    ...r,
    savedPlanName: result.savedPlanNameByShipmentId[r.shipmentId] ?? "",
  }));

  return (
    <main className="mx-auto max-w-[min(100vw-2rem,1600px)] px-4 py-6 md:px-6 md:py-8">
      <nav className="mb-4 text-xs text-[#888888]">
        <Link href="/planner" className="hover:text-[#1D9E75]">
          Planner
        </Link>
        <span className="mx-1.5 opacity-60" aria-hidden>
          /
        </span>
        <span className="text-[#e0e0e0]">Shipments</span>
      </nav>
      <ShipmentsSavedPlansTable rows={rows} />
    </main>
  );
}
