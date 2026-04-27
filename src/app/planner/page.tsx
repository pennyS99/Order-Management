import { PlannerResults } from "@/components/planner/PlannerResults";
import { CsvUploadPanel } from "@/components/upload/CsvUploadPanel";

export default function PlannerPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="space-y-10">
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
