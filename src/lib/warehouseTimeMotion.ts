import fs from "node:fs";
import path from "node:path";

export type WarehouseTimeMotionSettings = {
  pickingMp: number;
  pickingRateCasesPerHour: number;
  loadingDock: number;
  loadingRateCasesPerHour: number;
  startPickingTime: string;
  startLoadingTime: string;
};

type AppSettingsRecord = Record<
  string,
  {
    value: string;
    value_type: "string" | "number" | "boolean";
    description?: string;
  }
>;

function appSettingsFilePath(): string {
  return path.join(process.cwd(), "data", "app-settings.json");
}

function readAppSettingsSync(): AppSettingsRecord {
  const filePath = appSettingsFilePath();
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as AppSettingsRecord;
  } catch {
    return {};
  }
}

function writeAppSettingsSync(next: AppSettingsRecord): void {
  const filePath = appSettingsFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2) + "\n", "utf8");
}

function readNumberSetting(all: AppSettingsRecord, key: string, fallback: number): number {
  const raw = all[key]?.value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readStringSetting(all: AppSettingsRecord, key: string, fallback: string): string {
  const raw = all[key]?.value;
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

export function getWarehouseTimeMotionSettings(): WarehouseTimeMotionSettings {
  const all = readAppSettingsSync();
  return {
    pickingMp: readNumberSetting(all, "planner.warehouse_time_motion.picking_mp", 1),
    pickingRateCasesPerHour: readNumberSetting(
      all,
      "planner.warehouse_time_motion.picking_rate_cases_per_hour",
      1500,
    ),
    loadingDock: readNumberSetting(all, "planner.warehouse_time_motion.loading_dock", 1),
    loadingRateCasesPerHour: readNumberSetting(
      all,
      "planner.warehouse_time_motion.loading_rate_cases_per_hour",
      1500,
    ),
    startPickingTime: readStringSetting(all, "planner.warehouse_time_motion.start_picking_time", "13:00"),
    startLoadingTime: readStringSetting(all, "planner.warehouse_time_motion.start_loading_time", "13:00"),
  };
}

export function upsertWarehouseTimeMotionSettings(
  payload: WarehouseTimeMotionSettings,
): WarehouseTimeMotionSettings {
  const all = readAppSettingsSync();

  all["planner.warehouse_time_motion.picking_mp"] = {
    value: String(payload.pickingMp),
    value_type: "number",
    description: "Warehouse Time Motion — Picking MP",
  };
  all["planner.warehouse_time_motion.picking_rate_cases_per_hour"] = {
    value: String(payload.pickingRateCasesPerHour),
    value_type: "number",
    description: "Warehouse Time Motion — Picking Rate (Cases/Hour)",
  };
  all["planner.warehouse_time_motion.loading_dock"] = {
    value: String(payload.loadingDock),
    value_type: "number",
    description: "Warehouse Time Motion — Loading Dock",
  };
  all["planner.warehouse_time_motion.loading_rate_cases_per_hour"] = {
    value: String(payload.loadingRateCasesPerHour),
    value_type: "number",
    description: "Warehouse Time Motion — Loading Rate (Cases/Hour)",
  };
  all["planner.warehouse_time_motion.start_picking_time"] = {
    value: payload.startPickingTime,
    value_type: "string",
    description: "Warehouse Time Motion — Start Picking Time (HH:mm)",
  };
  all["planner.warehouse_time_motion.start_loading_time"] = {
    value: payload.startLoadingTime,
    value_type: "string",
    description: "Warehouse Time Motion — Start Loading Time (HH:mm)",
  };

  writeAppSettingsSync(all);
  return payload;
}

