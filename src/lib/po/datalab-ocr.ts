const DATALAB_BASE_URL = "https://www.datalab.to";

export interface DatalabOcrOptions {
  apiKey: string;
  /** Total time allowed for convert+polling. */
  timeoutMs?: number;
  /** Poll interval (2–3s recommended by Datalab). */
  pollIntervalMs?: number;
}

type DatalabMarkerInitialResponse = {
  success?: boolean;
  error?: string | null;
  request_id?: string;
  request_check_url?: string;
};

type DatalabMarkerResult = {
  status: string;
  success?: boolean | null;
  error?: string | null;
  markdown?: string | null;
  page_count?: number | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(res: Response): number | null {
  const v = res.headers.get("retry-after");
  if (!v) return null;
  const seconds = Number(v);
  if (Number.isFinite(seconds) && seconds > 0) return Math.floor(seconds * 1000);
  const dateMs = Date.parse(v);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function normalizeMarkdown(markdown: string): string {
  // Keep output as markdown (downstream expects "text", but scanned PDFs are OCR-derived
  // anyway). We only normalize newlines for consistency.
  return markdown.replaceAll("\r\n", "\n").trim();
}

export async function extractTextWithDatalabChandraOcr2(
  pdfBuffer: Buffer,
  options: DatalabOcrOptions
): Promise<{ text: string; pageCount?: number }> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_200;

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    const form = new FormData();
    form.set("langs", "English,Indonesian");
    form.set("ocr_all_pages", "true");
    // Node/Next provides Blob; if not, this will throw early and caller can fall back.
    form.set("file", new Blob([pdfBuffer], { type: "application/pdf" }), "document.pdf");

    const startedAt = Date.now();
    let initRes: Response | null = null;
    let initAttempt = 0;
    while (Date.now() - startedAt < timeoutMs) {
      initAttempt++;
      initRes = await fetch(`${DATALAB_BASE_URL}/api/v1/marker`, {
        method: "POST",
        headers: { "X-Api-Key": options.apiKey },
        body: form,
        signal: abortController.signal,
      });

      if (initRes.status !== 429) break;

      const retryAfterMs = parseRetryAfterMs(initRes);
      const baseBackoff = Math.min(60_000, 2_000 * Math.max(1, initAttempt)); // 2s, 4s, 6s... capped
      const jitter = Math.floor(Math.random() * 500);
      const waitMs = Math.max(2_000, retryAfterMs ?? baseBackoff) + jitter;
      await sleep(waitMs);
    }

    if (!initRes) {
      throw new Error("Datalab marker failed: no response");
    }

    if (!initRes.ok) {
      const body = await initRes.text().catch(() => "");
      throw new Error(`Datalab marker failed (${initRes.status}): ${body || initRes.statusText}`);
    }

    const initial = (await initRes.json()) as DatalabMarkerInitialResponse;
    const requestCheckUrl = initial.request_check_url;
    if (!requestCheckUrl) {
      throw new Error(
        `Datalab marker returned no request_check_url${initial.error ? `: ${initial.error}` : ""}`
      );
    }

    while (Date.now() - startedAt < timeoutMs) {
      const resultRes = await fetch(requestCheckUrl, {
        method: "GET",
        headers: { "X-Api-Key": options.apiKey },
        signal: abortController.signal,
      });

      if (resultRes.status === 429) {
        const retryAfterMs = parseRetryAfterMs(resultRes);
        const jitter = Math.floor(Math.random() * 700);
        await sleep((retryAfterMs ?? pollIntervalMs) + jitter);
        continue;
      }

      if (!resultRes.ok) {
        const body = await resultRes.text().catch(() => "");
        throw new Error(`Datalab marker poll failed (${resultRes.status}): ${body || resultRes.statusText}`);
      }

      const result = (await resultRes.json()) as DatalabMarkerResult;

      if (result.status === "complete") {
        if (result.success === false) {
          throw new Error(result.error || "Datalab marker completed with success=false");
        }
        const md = result.markdown ?? "";
        return { text: normalizeMarkdown(md), pageCount: result.page_count ?? undefined };
      }

      if (result.status === "failed") {
        throw new Error(result.error || "Datalab marker failed");
      }

      // Poll every ~2–3 seconds (small jitter helps avoid thundering herd).
      const jitter = Math.floor(Math.random() * 700); // 0..699ms
      await sleep(pollIntervalMs + jitter);
    }

    throw new Error("Datalab marker timed out while polling");
  } finally {
    clearTimeout(timeout);
  }
}

