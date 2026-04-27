import { SavedPlansGlobalSearchClient } from "@/components/planner/SavedPlansGlobalSearchClient";

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ShipmentsPage() {
  const defaultPldIso = todayIso();

  return (
    <main className="p-0">
      <SavedPlansGlobalSearchClient
        defaultPldIso={defaultPldIso}
        autoSearchOnMount
        layout="gmaps"
        frame="none"
        // Header height differs on mobile (2 rows) vs desktop (1 row)
        mapHeightClassName="h-[calc(100vh-112px)] md:h-[calc(100vh-64px)]"
        tableMaxHeightClassName="max-h-[38vh]"
      />
    </main>
  );
}

