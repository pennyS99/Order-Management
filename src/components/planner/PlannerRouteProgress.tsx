"use client";

/**
 * Indeterminate route-planning strip — matches dark-ops / terminal HUD (phosphor sweep on charcoal).
 */
export function PlannerRouteProgress() {
  return (
    <div
      className="om-planner-progress overflow-hidden rounded-md px-1 py-2.5 sm:px-0"
      role="progressbar"
      aria-valuetext="Planning routes and driving matrix"
      aria-busy="true"
    >
      <div className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--om-text-muted)]">
          Consolidation pipeline
        </p>
        <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums text-[var(--om-accent)] opacity-90 [text-shadow:0_0_12px_color-mix(in_srgb,var(--om-accent)_40%,transparent)]">
          RUN
        </span>
      </div>
      <div className="om-planner-progress__track" aria-hidden>
        <div className="om-planner-progress__fill" />
        {/* Fine scanline texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-12deg, transparent, transparent 1px, rgba(0,0,0,0.35) 1px, rgba(0,0,0,0.35) 2px)",
          }}
        />
      </div>
      <p className="mt-2 px-0.5 font-mono text-[11px] leading-snug text-[var(--om-text-muted)]">
        <span className="text-[var(--om-accent)] opacity-75">→</span>{" "}
        Matrix prefetch · cluster merge · time windows
      </p>
    </div>
  );
}
