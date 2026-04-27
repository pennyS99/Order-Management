import { NextRequest, NextResponse } from "next/server";
import { mutateMasters, nextItemId, readMasters, type ItemMasterRow } from "@/lib/mastersStore";

export async function GET() {
  const data = await readMasters();
  const rows = [...data.items].sort((a, b) => a.item.localeCompare(b.item));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { item: string; cbm: number; weightKg: number };
  let row: ItemMasterRow | undefined;
  try {
    await mutateMasters((data) => {
      const item = body.item.trim();
      if (data.items.some((r) => r.item === item)) {
        const err = new Error("Duplicate item");
        (err as Error & { status: number }).status = 409;
        throw err;
      }
      row = { id: nextItemId(data), item, cbm: Number(body.cbm), weightKg: Number(body.weightKg) };
      data.items.push(row);
    });
    const fresh = await readMasters();
    row = fresh.items.find((r) => r.item === body.item.trim());
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 409) {
      return NextResponse.json({ error: "Duplicate item." }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json(row);
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as { id: number; item: string; cbm: number; weightKg: number };
  let row: ItemMasterRow | undefined;
  try {
    await mutateMasters((data) => {
      const idx = data.items.findIndex((r) => r.id === Number(body.id));
      if (idx === -1) {
        const err = new Error("Not found");
        (err as Error & { status: number }).status = 404;
        throw err;
      }
      const item = body.item.trim();
      if (data.items.some((r, i) => r.item === item && i !== idx)) {
        const err = new Error("Duplicate item");
        (err as Error & { status: number }).status = 409;
        throw err;
      }
      row = { ...data.items[idx], item, cbm: Number(body.cbm), weightKg: Number(body.weightKg) };
      data.items[idx] = row;
    });
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 404) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (status === 409) return NextResponse.json({ error: "Duplicate item." }, { status: 409 });
    throw e;
  }
  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  let found = false;
  await mutateMasters((data) => {
    const next = data.items.filter((r) => r.id !== id);
    found = next.length < data.items.length;
    data.items = next;
  });
  if (!found) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
