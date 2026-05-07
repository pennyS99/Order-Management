import Link from "next/link";

import { SavedPlansGlobalSearchClient } from "@/components/planner/SavedPlansGlobalSearchClient";

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ShipmentsMapPage() {
  const defaultPldIso = todayIso();

  return (
    <main className="p-0">
      <nav className="absolute left-0 top-0 z-[25] flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--muted-foreground)] md:left-[332px] md:px-2">
        <Link
          href="/shipments"
          className="rounded-md border border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_88%,transparent)] px-2 py-1 text-[var(--text)]/85 shadow-sm hover:border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] hover:text-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        >
          Back to shipments
        </Link>
      </nav>
      <SavedPlansGlobalSearchClient
        defaultPldIso={defaultPldIso}
        autoSearchOnMount
        layout="gmaps"
        frame="none"
        mapHeightClassName="h-[calc(100vh-112px)] md:h-[calc(100vh-64px)]"
        tableMaxHeightClassName="max-h-[38vh]"
      />
    </main>
  );
}
