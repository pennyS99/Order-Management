import { NextResponse } from "next/server";
import { readMasters } from "@/lib/mastersStore";

export async function GET() {
  const data = await readMasters();
  const items = [...data.items].sort((a, b) => a.item.localeCompare(b.item));
  const addresses = [...data.addresses].sort((a, b) => a.dcName.localeCompare(b.dcName));
  const trucks = [...data.trucks].sort((a, b) => a.truckType.localeCompare(b.truckType));
  return NextResponse.json({ items, addresses, trucks });
}
