import { NextResponse } from "next/server";
import { loadDefaultHeadersFromRepository } from "@/lib/po/config";

export async function GET() {
  try {
    const headers = await loadDefaultHeadersFromRepository();
    return NextResponse.json({ headers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load default headers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
