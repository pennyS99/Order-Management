import { NextRequest, NextResponse } from "next/server";
import { mutateMasters, nextTruckId, readMasters, type TruckMasterRow } from "@/lib/mastersStore";

export async function GET() {
  const data = await readMasters();
  const rows = [...data.trucks].sort((a, b) => a.truckType.localeCompare(b.truckType));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { truckType: string; maxKg: number; maxCbm: number };
  let row: TruckMasterRow | undefined;
  try {
    await mutateMasters((data) => {
      const truckType = body.truckType.trim();
      if (data.trucks.some((r) => r.truckType === truckType)) {
        const err = new Error("Duplicate truckType");
        (err as Error & { status: number }).status = 409;
        throw err;
      }
      row = {
        id: nextTruckId(data),
        truckType,
        maxKg: Number(body.maxKg),
        maxCbm: Number(body.maxCbm),
      };
      data.trucks.push(row);
    });
    const fresh = await readMasters();
    row = fresh.trucks.find((r) => r.truckType === body.truckType.trim());
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 409) {
      return NextResponse.json({ error: "Duplicate truck type." }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json(row);
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as {
    id: number;
    truckType: string;
    maxKg: number;
    maxCbm: number;
  };
  let row: TruckMasterRow | undefined;
  try {
    await mutateMasters((data) => {
      const idx = data.trucks.findIndex((r) => r.id === Number(body.id));
      if (idx === -1) {
        const err = new Error("Not found");
        (err as Error & { status: number }).status = 404;
        throw err;
      }
      const truckType = body.truckType.trim();
      if (data.trucks.some((r, i) => r.truckType === truckType && i !== idx)) {
        const err = new Error("Duplicate truckType");
        (err as Error & { status: number }).status = 409;
        throw err;
      }
      row = {
        ...data.trucks[idx],
        truckType,
        maxKg: Number(body.maxKg),
        maxCbm: Number(body.maxCbm),
      };
      data.trucks[idx] = row;
    });
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 404) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (status === 409) return NextResponse.json({ error: "Duplicate truck type." }, { status: 409 });
    throw e;
  }
  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  let found = false;
  await mutateMasters((data) => {
    const next = data.trucks.filter((r) => r.id !== id);
    found = next.length < data.trucks.length;
    data.trucks = next;
  });
  if (!found) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
