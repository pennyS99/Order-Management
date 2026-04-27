import { NextRequest, NextResponse } from "next/server";
import { mutateMasters, nextAddressId, readMasters, type AddressMasterRow } from "@/lib/mastersStore";

export async function GET() {
  const data = await readMasters();
  const rows = [...data.addresses].sort((a, b) => a.dcName.localeCompare(b.dcName));
  return NextResponse.json(rows);
}

type AddressBody = {
  dcName: string;
  latitude: number;
  longitude: number;
  province?: string;
  city?: string;
  origin?: string;
  channelType?: string;
  transportMode?: string;
  maxKgLtlLcl?: number | null;
  leadTimeFtlFcl?: number | null;
  leadTimeLtlLcl?: number | null;
  registerOpen?: string;
  registerClosed?: string;
  unloadDurationMin?: number | null;
};

/** Normalize "H:mm" / "HH:mm" / "H" strings to "HH:mm". Returns "" if unparseable. */
function normalizeTimeString(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const match = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(raw);
  if (!match) return raw;
  const hours = Math.min(23, Math.max(0, Number(match[1] ?? 0)));
  const minutes = Math.min(59, Math.max(0, Number(match[2] ?? 0)));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function resolveUnloadDuration(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as AddressBody;
  let row: AddressMasterRow | undefined;
  try {
    await mutateMasters((data) => {
      const dcName = body.dcName.trim();
      if (data.addresses.some((r) => r.dcName === dcName)) {
        const err = new Error("Duplicate dcName");
        (err as Error & { status: number }).status = 409;
        throw err;
      }
      row = {
        id: nextAddressId(data),
        dcName,
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
        province: body.province?.trim() ?? "",
        city: body.city?.trim() ?? "",
        origin: body.origin?.trim() ?? "",
        channelType: body.channelType?.trim() ?? "",
        transportMode: body.transportMode?.trim() ?? "",
        maxKgLtlLcl:
          typeof body.maxKgLtlLcl === "number" && Number.isFinite(body.maxKgLtlLcl)
            ? body.maxKgLtlLcl
            : null,
        leadTimeFtlFcl:
          typeof body.leadTimeFtlFcl === "number" && Number.isFinite(body.leadTimeFtlFcl)
            ? body.leadTimeFtlFcl
            : null,
        leadTimeLtlLcl:
          typeof body.leadTimeLtlLcl === "number" && Number.isFinite(body.leadTimeLtlLcl)
            ? body.leadTimeLtlLcl
            : null,
        registerOpen: normalizeTimeString(body.registerOpen),
        registerClosed: normalizeTimeString(body.registerClosed),
        unloadDurationMin: resolveUnloadDuration(body.unloadDurationMin),
      };
      data.addresses.push(row);
    });
    const fresh = await readMasters();
    row = fresh.addresses.find((r) => r.dcName === body.dcName.trim());
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 409) {
      return NextResponse.json({ error: "Duplicate DC name." }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json(row);
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as AddressBody & { id: number };
  let row: AddressMasterRow | undefined;
  try {
    await mutateMasters((data) => {
      const idx = data.addresses.findIndex((r) => r.id === Number(body.id));
      if (idx === -1) {
        const err = new Error("Not found");
        (err as Error & { status: number }).status = 404;
        throw err;
      }
      const dcName = body.dcName.trim();
      if (data.addresses.some((r, i) => r.dcName === dcName && i !== idx)) {
        const err = new Error("Duplicate dcName");
        (err as Error & { status: number }).status = 409;
        throw err;
      }
      row = {
        ...data.addresses[idx],
        dcName,
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
        province: body.province?.trim() ?? "",
        city: body.city?.trim() ?? "",
        origin: body.origin?.trim() ?? "",
        channelType: body.channelType?.trim() ?? "",
        transportMode: body.transportMode?.trim() ?? "",
        maxKgLtlLcl:
          typeof body.maxKgLtlLcl === "number" && Number.isFinite(body.maxKgLtlLcl)
            ? body.maxKgLtlLcl
            : null,
        leadTimeFtlFcl:
          typeof body.leadTimeFtlFcl === "number" && Number.isFinite(body.leadTimeFtlFcl)
            ? body.leadTimeFtlFcl
            : null,
        leadTimeLtlLcl:
          typeof body.leadTimeLtlLcl === "number" && Number.isFinite(body.leadTimeLtlLcl)
            ? body.leadTimeLtlLcl
            : null,
        registerOpen: normalizeTimeString(body.registerOpen),
        registerClosed: normalizeTimeString(body.registerClosed),
        unloadDurationMin: resolveUnloadDuration(body.unloadDurationMin),
      };
      data.addresses[idx] = row;
    });
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 404) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (status === 409) return NextResponse.json({ error: "Duplicate DC name." }, { status: 409 });
    throw e;
  }
  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  let found = false;
  await mutateMasters((data) => {
    const next = data.addresses.filter((r) => r.id !== id);
    found = next.length < data.addresses.length;
    data.addresses = next;
  });
  if (!found) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
