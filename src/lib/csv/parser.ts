import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParseTabularResult<T> {
  rows: T[];
  errors: string[];
}

function normalizeHeaders<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => {
    const normalized = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.trim(), value]),
    );
    return normalized as T;
  });
}

function parseCsvFile<T>(file: File): Promise<ParseTabularResult<T>> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const errors = results.errors.map(
          (error) => `Row ${error.row ?? "unknown"}: ${error.message}`,
        );
        resolve({
          rows: results.data,
          errors,
        });
      },
      error: (error) => reject(error),
    });
  });
}

async function parseExcelFile<T extends Record<string, unknown>>(
  file: File,
): Promise<ParseTabularResult<T>> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return { rows: [], errors: ["No worksheet found in workbook."] };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<T>(worksheet, {
    defval: "",
    raw: false,
  });

  return {
    rows: normalizeHeaders(rows),
    errors: [],
  };
}

export async function parseTabularFile<T extends Record<string, unknown>>(
  file: File,
): Promise<ParseTabularResult<T>> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx" || extension === "xlsm" || extension === "xls") {
    return parseExcelFile<T>(file);
  }
  return parseCsvFile<T>(file);
}
