import type { SavedShipmentTableRow } from "@/components/planner/ShipmentsSavedPlansTable";
import { readMasters } from "@/lib/mastersStore";
import { buildDcSummaryRows } from "@/lib/planner/dcSummaryRows";
import { searchSavedPlansAcrossAll } from "@/lib/savedPlansStore";
import { ShipmentsDashboardClient } from "./ShipmentsDashboardClient";

export default async function ShipmentsPage() {
  const result = await searchSavedPlansAcrossAll({});
  const masters = await readMasters();
  const channelTypeByDcName = new Map(
    masters.addresses
      .map((a) => [String(a.dcName ?? "").trim(), String(a.channelType ?? "").trim()] as const)
      .filter(([dc]) => Boolean(dc)),
  );

  const rows: SavedShipmentTableRow[] = buildDcSummaryRows(result.shipments).map((r) => {
    const channelType = channelTypeByDcName.get(r.dcName)?.trim() || r.channelType?.trim?.() || "";
    return {
      ...r,
      channelType,
      savedPlanName: result.savedPlanNameByShipmentId[r.shipmentId] ?? "",
    };
  });

  return <ShipmentsDashboardClient rows={rows} />;
}
