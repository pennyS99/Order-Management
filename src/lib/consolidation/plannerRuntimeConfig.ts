/** Planner tunables (from `app_settings` seed keys under `planner.*`). */
export type PlannerRuntimeConfig = {
  maxDropsDefault: number;
  microClusterThresholdKm: number;
  maxFirstToLastRouteKm: number;
  arrivalBufferBeforeCloseMin: number;
  globalLunchStartMin: number;
  globalLunchEndMin: number;
  fullLoadUtilizationThreshold: number;
  containerAliasesCont20: string[];
  containerAliasesCont40: string[];
  landTruckCeilingName: string;
  fclFallbackTruckType: string;
};

export const DEFAULT_PLANNER_RUNTIME_CONFIG: PlannerRuntimeConfig = {
  maxDropsDefault: 3,
  microClusterThresholdKm: 0.3,
  maxFirstToLastRouteKm: 25,
  arrivalBufferBeforeCloseMin: 60,
  globalLunchStartMin: 12 * 60,
  globalLunchEndMin: 13 * 60,
  fullLoadUtilizationThreshold: 70,
  containerAliasesCont20: ["Cont 20 FT", "Cont 20 ft"],
  containerAliasesCont40: ["Cont 40 FT", "Cont 40 ft"],
  landTruckCeilingName: "wingbox",
  fclFallbackTruckType: "Cont 40 FT",
};
