import {
  DEFAULT_PLANNER_RUNTIME_CONFIG,
  type PlannerRuntimeConfig,
} from "@/lib/consolidation/plannerRuntimeConfig";

/**
 * Restored: file-based app (no DB settings). Keep all planner tunables hardcoded.
 */
export function loadPlannerRuntimeConfig(): PlannerRuntimeConfig {
  return DEFAULT_PLANNER_RUNTIME_CONFIG;
}
