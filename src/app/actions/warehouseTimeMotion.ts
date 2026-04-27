"use server";

import {
  getWarehouseTimeMotionSettings,
  upsertWarehouseTimeMotionSettings,
  type WarehouseTimeMotionSettings,
} from "@/lib/warehouseTimeMotion";

export async function getWarehouseTimeMotionSettingsAction(): Promise<{
  success: boolean;
  data?: WarehouseTimeMotionSettings;
  error?: string;
}> {
  try {
    const data = await getWarehouseTimeMotionSettings();
    return { success: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load Warehouse Time Motion settings";
    return { success: false, error: msg };
  }
}

export async function saveWarehouseTimeMotionSettingsAction(
  payload: WarehouseTimeMotionSettings,
): Promise<{ success: boolean; data?: WarehouseTimeMotionSettings; error?: string }> {
  try {
    const data = await upsertWarehouseTimeMotionSettings(payload);
    return { success: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save Warehouse Time Motion settings";
    return { success: false, error: msg };
  }
}
