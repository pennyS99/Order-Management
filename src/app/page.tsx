import Link from "next/link";
import { AnnouncementBadge } from "@/components/po/AnnouncementBadge";
import { TerminalSnippet } from "@/components/po/TerminalSnippet";
import { Button } from "@/components/po/ui/button";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl flex-col px-6 py-10">
      <section className="flex flex-1 flex-col items-center justify-center px-2 pb-12 pt-4 text-center md:py-16">
        <div className="om-hero-reveal max-w-3xl space-y-8" data-step="1">
          <AnnouncementBadge>Planner v1 — consolidation ready</AnnouncementBadge>
        </div>

        <h1
          className="om-hero-reveal mt-2 max-w-4xl font-display text-4xl font-black leading-[1.05] tracking-tight text-[var(--text)] sm:text-5xl md:text-6xl lg:text-7xl"
          data-step="2"
        >
          Route every stop.
          <br />
          <span className="text-[var(--primary)]">Ship with precision.</span>
        </h1>

        <div className="om-hero-reveal mt-2 flex flex-col items-center gap-3 sm:flex-row sm:gap-4" data-step="3">
          <Button asChild size="lg" className="om-cta-pulse min-w-[180px]">
            <Link href="/planner">Open workspace</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="min-w-[180px] font-semibold">
            <Link href="/extract">PO Extract</Link>
          </Button>
        </div>

        <div className="om-hero-reveal mt-10 w-full max-w-xl px-2" data-step="4">
          <TerminalSnippet command="om planner consolidate --orders ./orders.csv" className="w-full justify-between" />
        </div>
      </section>
    </main>
  );
}
