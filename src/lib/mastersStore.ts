import path from "node:path";
import fs from "node:fs";

export type ItemMasterRow = { id: number; item: string; cbm: number; weightKg: number };
export type AddressMasterRow = {
  id: number;
  dcName: string;
  latitude: number;
  longitude: number;
  province: string;
  city: string;
  origin: string;
  channelType: string;
  transportMode: string;
  maxKgLtlLcl: number | null;
  leadTimeFtlFcl: number | null;
  leadTimeLtlLcl: number | null;
  /** DC register (gate-in) open time, "HH:mm" 24h format. Empty string if unknown. */
  registerOpen: string;
  /** DC register (gate-in) close time, "HH:mm" 24h format. Empty string if unknown. */
  registerClosed: string;
  /** Average/expected unloading duration at the DC, in minutes. Null if unknown. */
  unloadDurationMin: number | null;
};
export type TruckMasterRow = { id: number; truckType: string; maxKg: number; maxCbm: number };

export type MastersData = {
  items: ItemMasterRow[];
  addresses: AddressMasterRow[];
  trucks: TruckMasterRow[];
};

function mastersFilePath(): string {
  return path.join(process.cwd(), "data", "masters.json");
}

const EMPTY: MastersData = { items: [], addresses: [], trucks: [] };

function loadFromFileSync(): MastersData {
  const filePath = mastersFilePath();
  try {
    if (!fs.existsSync(filePath)) return { ...EMPTY };
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return { ...EMPTY };
    const parsed = JSON.parse(raw) as MastersData;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      addresses: Array.isArray(parsed.addresses) ? parsed.addresses : [],
      trucks: Array.isArray(parsed.trucks) ? parsed.trucks : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

let chain: Promise<unknown> = Promise.resolve();

function runLocked<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function readMasters(): Promise<MastersData> {
  return runLocked(async () => loadFromFileSync());
}

function persistMastersToFileSync(data: MastersData): void {
  const filePath = mastersFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function mutateMasters(mutator: (data: MastersData) => void): Promise<void> {
  await runLocked(async () => {
    const data = loadFromFileSync();
    mutator(data);
    persistMastersToFileSync(data);
  });
}

export function nextItemId(data: MastersData): number {
  return data.items.reduce((m, r) => Math.max(m, r.id), 0) + 1;
}

export function nextAddressId(data: MastersData): number {
  return data.addresses.reduce((m, r) => Math.max(m, r.id), 0) + 1;
}

export function nextTruckId(data: MastersData): number {
  return data.trucks.reduce((m, r) => Math.max(m, r.id), 0) + 1;
}
