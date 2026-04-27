import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return fallback;
    throw err;
  }
}

export async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  const json = JSON.stringify(data, null, 2) + "\n";

  await fs.writeFile(tmpPath, json, "utf8");
  // On Windows, rename over an existing target can be flaky; remove first.
  await fs.rm(filePath, { force: true });
  await fs.rename(tmpPath, filePath);
}
