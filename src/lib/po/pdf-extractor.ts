import type { ExtractionMetadata } from "./types";
import { preprocessForOcr } from "./image-preprocess";
import { config } from "./config";
import fs from "node:fs/promises";
import path from "node:path";

const MIN_TEXT_PER_PAGE = 100;

export interface PdfExtractionResult {
  text: string;
  metadata: ExtractionMetadata;
}

async function getLocalEngLangPath(): Promise<string | null> {
  const root = process.cwd();
  const candidates = [
    path.join(root, "node_modules", "@tesseract.js-data", "eng", "4.0.0"),
    path.join(root, "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int"),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, "eng.traineddata.gz"));
      return candidate;
    } catch {
      // keep trying other candidates
    }
  }

  return null;
}

async function extractWithPdfParse(buffer: Buffer): Promise<{ text: string; numPages: number }> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return {
    text: data.text || "",
    numPages: data.numpages || 1,
  };
}

async function extractWithUnpdf(buffer: Buffer): Promise<{ text: string; numPages: number }> {
  const { extractText: unpdfExtractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await unpdfExtractText(pdf, { mergePages: true });
  return {
    text: text || "",
    numPages: totalPages || 1,
  };
}

async function extractText(buffer: Buffer): Promise<{ text: string; numPages: number }> {
  // Try unpdf first - handles bad XRef PDFs (common in Alfamart/Alfamidi) that pdf-parse fails on
  try {
    const result = await extractWithUnpdf(buffer);
    if (result.text && result.text.trim().length > 50) return result;
  } catch {
    // unpdf failed, fall through to pdf-parse
  }
  try {
    return await extractWithPdfParse(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/XRef|xref|Invalid|bad/i.test(msg)) {
      try {
        return await extractWithUnpdf(buffer);
      } catch (unpdfErr) {
        throw new Error(
          "PDF parsing failed (bad XRef). The file may be corrupted. Try re-saving the PDF (e.g. 'Print to PDF' in another app) or use a different file."
        );
      }
    }
    throw err;
  }
}

async function extractWithOcr(
  buffer: Buffer,
  numPages: number
): Promise<{ text: string }> {
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  const { createWorker, createScheduler, PSM } = await import("tesseract.js");
  const os = await import("node:os");

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const numWorkers = Math.min(numPages, Math.max(1, os.cpus().length - 1), 4);
  const scheduler = createScheduler();
  const localEngLangPath = await getLocalEngLangPath();
  // Prefer bundled local English data to avoid runtime CDN fetch/TLS issues.
  const langs = localEngLangPath ? "eng" : config.ocr.languages.join("+");

  for (let i = 0; i < numWorkers; i++) {
    const worker = await createWorker(
      langs,
      undefined,
      localEngLangPath
        ? { langPath: localEngLangPath, logger: () => {} }
        : { logger: () => {} },
    );
    worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    scheduler.addWorker(worker);
  }

  const pagesArray = Array.from({ length: numPages }, (_, i) => i + 1);
  const results = await Promise.all(
    pagesArray.map(async (p) => {
      const arrayBuffer = await renderPageAsImage(pdf, p, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale: 2,
      });
      const pageBuffer = Buffer.from(arrayBuffer);
      const enhancedBuffer = await preprocessForOcr(pageBuffer);
      const jobResult = await scheduler.addJob('recognize', enhancedBuffer);
      return { p, jobResult };
    })
  );

  await scheduler.terminate();

  const pageTexts = results
    .sort((a, b) => a.p - b.p) // ensure chronological order
    .map(({ p, jobResult }) => `Page ${p}:\n${jobResult.data.text || ""}`);

  return { text: pageTexts.join("\n\n") };
}

/**
 * Quick extraction: get text and detect if scanned, without running OCR.
 * Use this to route documents by extraction strategy.
 */
export async function extractPdfTextQuick(
  buffer: Buffer
): Promise<{ text: string; numPages: number; needsOcr: boolean }> {
  const { text, numPages } = await extractText(buffer);
  const needsOcr = text.length / Math.max(1, numPages) < MIN_TEXT_PER_PAGE;
  return { text, numPages, needsOcr };
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractionResult> {
  const { text: initialText, numPages } = await extractText(buffer);

  const textPerPage = initialText.length / Math.max(1, numPages);
  const needsOcr = textPerPage < MIN_TEXT_PER_PAGE;

  if (!needsOcr) {
    return {
      text: initialText,
      metadata: {
        method: "digital",
        pageCount: numPages,
      },
    };
  }

  try {
    const { text: ocrText } = await extractWithOcr(buffer, numPages);
    const hasDigitalContent = initialText.trim().length > 0;

    return {
      text: hasDigitalContent ? `${initialText}\n\n${ocrText}` : ocrText,
      metadata: {
        method: hasDigitalContent ? "mixed" : "ocr",
        pageCount: numPages,
      },
    };
  } catch (ocrError) {
    return {
      text: initialText,
      metadata: {
        method: "digital",
        pageCount: numPages,
      },
    };
  }
}
