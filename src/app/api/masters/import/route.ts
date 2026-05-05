import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { mutateMasters, nextAddressId, nextItemId, nextTruckId } from "@/lib/mastersStore";

type DatasetKey = "item" | "address" | "truck";

function normalizeRows(rows: Record<string, unknown>[]) {
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), value])),
  );
}

function toNumber(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return 0;
  const parsed = Number(text.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toOptionalNumber(value: unknown): number | null {
  const text = toText(value);
  if (!text || text === "-") return null;
  const parsed = Number(text.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Normalize "H:mm" / "HH:mm" / "H" strings to "HH:mm". Returns "" if unparseable. */
function toTimeString(value: unknown): string {
  const raw = toText(value);
  if (!raw) return "";
  const match = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(raw);
  if (!match) return raw;
  const hours = Math.min(23, Math.max(0, Number(match[1] ?? 0)));
  const minutes = Math.min(59, Math.max(0, Number(match[2] ?? 0)));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "");
}

function readCell(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedAliasSet = new Set(aliases.map(normalizeHeaderKey));
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliasSet.has(normalizeHeaderKey(key))) return value;
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const dataset = formData.get("dataset") as DatasetKey | null;
  const file = formData.get("file");

  if (!dataset || !["item", "address", "truck"].includes(dataset)) {
    return NextResponse.json({ error: "Invalid dataset key." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }

  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return NextResponse.json({ error: "No sheet found in workbook." }, { status: 400 });
  }

  const worksheet = workbook.Sheets[firstSheet];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: false,
  });
  const rows = normalizeRows(rawRows);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  await mutateMasters((data) => {
    if (dataset === "item") {
      for (const row of rows) {
        const item = String(row.ITEM ?? "").trim();
        if (!item) {
          skipped += 1;
          continue;
        }
        const cbm = toNumber(row.CBM);
        const weightKg = toNumber(row["Weight (KG)"]);
        const idx = data.items.findIndex((r) => r.item === item);
        if (idx >= 0) {
          data.items[idx] = { ...data.items[idx], cbm, weightKg };
          updated += 1;
        } else {
          data.items.push({ id: nextItemId(data), item, cbm, weightKg });
          created += 1;
        }
      }
    }

    if (dataset === "address") {
      const seenDc = new Set<string>();
      for (const row of rows) {
        const dcName = toText(readCell(row, ["DC", "dcName"]));
        if (!dcName) {
          skipped += 1;
          continue;
        }
        if (seenDc.has(dcName)) {
          skipped += 1;
          continue;
        }
        seenDc.add(dcName);
        const latitude = toOptionalNumber(readCell(row, ["Latitude", "latitude"]));
        const longitude = toOptionalNumber(readCell(row, ["Longitude", "longitude"]));
        const origin = toText(readCell(row, ["Origin"]));
        const channelType = toText(readCell(row, ["Channel Type", "ChannelType"]));
        const transportMode = toText(readCell(row, ["Transport Mode", "transportmode"]));
        const maxKgLtlLcl = toOptionalNumber(
          readCell(row, ["Max KG LTL/LCL", "Max KG LTL LCL", "MaxKG LTL LCL"]),
        );
        const leadTimeFtlFcl = toOptionalNumber(
          readCell(row, [
            "leadtime_ftl/fcl",
            "leadtime ftl/fcl",
            "lead_time_ftl_fcl",
            "leadtimeftlfcl",
          ]),
        );
        const leadTimeLtlLcl = toOptionalNumber(
          readCell(row, [
            "leadtime_ltl/lcl",
            "leadtime ltl/lcl",
            "lead_time_ltl_lcl",
            "leadtimeltllcl",
          ]),
        );
        const province = toText(readCell(row, ["Province", "province"]));
        const city = toText(readCell(row, ["City", "city"]));
        const registerOpen = toTimeString(
          readCell(row, ["registeropen", "register open", "Register Open"]),
        );
        const registerClosed = toTimeString(
          readCell(row, [
            "registerclosed",
            "register closed",
            "Register Closed",
            "registerclose",
            "register close",
          ]),
        );
        const unloadDurationMin = toOptionalNumber(
          readCell(row, [
            "unloadduration_m",
            "unloadduration",
            "unload duration",
            "Unload Duration",
            "Unload Duration (min)",
            "unloaddurationmin",
          ]),
        );
        const payload = {
          dcName,
          latitude: latitude ?? 0,
          longitude: longitude ?? 0,
          province,
          city,
          origin,
          channelType,
          transportMode,
          maxKgLtlLcl,
          leadTimeFtlFcl,
          leadTimeLtlLcl,
          registerOpen,
          registerClosed,
          unloadDurationMin,
        };
        const idx = data.addresses.findIndex((a) => a.dcName === dcName);
        if (idx >= 0) {
          data.addresses[idx] = { ...data.addresses[idx], ...payload };
          updated += 1;
        } else {
          data.addresses.push({ id: nextAddressId(data), ...payload });
          created += 1;
        }
      }
    }

    if (dataset === "truck") {
      for (const row of rows) {
        const truckType = String(row["Truck Type"] ?? "").trim();
        if (!truckType) {
          skipped += 1;
          continue;
        }
        const maxKg = toNumber(row.Kg);
        const maxCbm = toNumber(row.CBM);
        const idx = data.trucks.findIndex((r) => r.truckType === truckType);
        if (idx >= 0) {
          data.trucks[idx] = { ...data.trucks[idx], maxKg, maxCbm };
          updated += 1;
        } else {
          data.trucks.push({ id: nextTruckId(data), truckType, maxKg, maxCbm });
          created += 1;
        }
      }
    }
  });

  return NextResponse.json({
    ok: true,
    dataset,
    totalRows: rows.length,
    created,
    updated,
    skipped,
  });
}
