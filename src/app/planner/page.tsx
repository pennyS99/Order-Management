import { PlannerResults } from "@/components/planner/PlannerResults";
import { CsvUploadPanel } from "@/components/upload/CsvUploadPanel";

export default function PlannerPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="space-y-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">
            Route planner
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
            Upload order data, generate consolidated shipments, and save the route plan for review.
          </p>
        </header>

        <section className="group relative">
          <CsvUploadPanel />
        </section>

        <section>
          <PlannerResults />
        </section>
      </div>
    </main>
  );
}
