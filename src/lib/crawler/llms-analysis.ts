import { safeFetch, CrawlFetchError } from "./safe-fetch";
import { parseLlmsTxt, type ParsedLlmsTxt } from "./llms-txt-parser";

export type LlmsFileKind = "llms_txt" | "llms_full_txt";

export interface LlmsFileResult {
  kind: LlmsFileKind;
  url: string;
  found: boolean;
  httpStatus: number | null;
  rawContent: string | null;
  sizeBytes: number | null;
  parsed: ParsedLlmsTxt | null;
}

const MAX_BYTES = 2 * 1024 * 1024; // 2MB — generous for a markdown link index, well under a real abuse case.

async function fetchOne(origin: string, path: string, kind: LlmsFileKind): Promise<LlmsFileResult> {
  const url = new URL(path, origin).toString();
  try {
    const res = await safeFetch(url, { maxBytes: MAX_BYTES });
    if (res.status < 200 || res.status >= 300) {
      return { kind, url, found: false, httpStatus: res.status, rawContent: null, sizeBytes: null, parsed: null };
    }
    return {
      kind,
      url,
      found: true,
      httpStatus: res.status,
      rawContent: res.body,
      sizeBytes: Buffer.byteLength(res.body, "utf-8"),
      parsed: parseLlmsTxt(res.body),
    };
  } catch (err) {
    if (err instanceof CrawlFetchError) {
      return { kind, url, found: false, httpStatus: null, rawContent: null, sizeBytes: null, parsed: null };
    }
    throw err;
  }
}

/**
 * Fetches and parses both `/llms.txt` and `/llms-full.txt` at the site
 * root, reusing the same SSRF-safe fetcher as every other well-known-file
 * check in this codebase (robots.txt, sitemap.xml). Both files are
 * optional/emerging — a missing file is a normal, non-error result here,
 * not a thrown exception; the rule evaluator decides what severity (if
 * any) that deserves.
 */
export async function analyzeLlmsFiles(origin: string): Promise<{ llmsTxt: LlmsFileResult; llmsFullTxt: LlmsFileResult }> {
  const [llmsTxt, llmsFullTxt] = await Promise.all([
    fetchOne(origin, "/llms.txt", "llms_txt"),
    fetchOne(origin, "/llms-full.txt", "llms_full_txt"),
  ]);
  return { llmsTxt, llmsFullTxt };
}
