import { safeFetch, CrawlFetchError } from "./safe-fetch";
import { parseSitemapXml, type ParsedSitemap } from "./sitemap-parser";
import type { SitemapDocumentInput } from "@/lib/seo-rules/sitemap";

const MAX_CHILD_SITEMAPS = 10;

/**
 * Phase 37 — the fetch outcome for ONE sitemap document, kept so the crawl can
 * persist it (see `sitemap_documents`). This sits ALONGSIDE `documents` rather
 * than inside it: `SitemapDocumentInput` is the rule engine's input shape and
 * was deliberately left untouched.
 */
export interface StoredSitemapDocument {
  url: string;
  httpStatus: number | null;
  /** The document's own bytes, verbatim. NULL when nothing was retrieved. */
  rawContent: string | null;
  /** `<url>` entries for a urlset, `<sitemap>` entries for an index. NULL when unparsed. */
  urlCount: number | null;
  isIndex: boolean | null;
  fetchError: string | null;
  /** The response exceeded the byte cap, so no body was kept at all. */
  overSizeCap: boolean;
}

export interface SitemapAnalysisResult {
  /** Every sitemap document actually fetched (the index itself, plus any children), for document-level issues. */
  documents: SitemapDocumentInput[];
  /** The same documents' raw fetch outcomes, for persistence (Phase 37). */
  stored: StoredSitemapDocument[];
  /** All URLs found across every urlset document, deduped, for cross-referencing against crawled pages. */
  allUrls: string[];
  found: boolean;
}

interface FetchedDocument {
  document: SitemapDocumentInput;
  stored: StoredSitemapDocument;
  parsed: ParsedSitemap | null;
}

async function fetchAndParse(url: string): Promise<FetchedDocument> {
  try {
    const res = await safeFetch(url, { maxBytes: 10 * 1024 * 1024 });
    if (res.status < 200 || res.status >= 300) {
      return {
        document: { url, httpStatus: res.status, valid: false, xmlErrors: [], kind: "unknown", urls: [] },
        stored: {
          url,
          httpStatus: res.status,
          rawContent: null,
          urlCount: null,
          isIndex: null,
          fetchError: null,
          overSizeCap: false,
        },
        parsed: null,
      };
    }
    const parsed = parseSitemapXml(res.body);
    return {
      document: {
        url,
        httpStatus: res.status,
        valid: parsed.valid,
        xmlErrors: parsed.errors,
        kind: parsed.kind,
        urls: parsed.urls.map((u) => ({ loc: u.loc, lastmod: u.lastmod })),
      },
      stored: {
        url,
        httpStatus: res.status,
        rawContent: res.body,
        urlCount: parsed.kind === "sitemapindex" ? parsed.sitemapRefs.length : parsed.urls.length,
        isIndex: parsed.kind === "sitemapindex",
        fetchError: null,
        overSizeCap: false,
      },
      parsed,
    };
  } catch (err) {
    if (err instanceof CrawlFetchError) {
      return {
        document: { url, httpStatus: null, valid: false, xmlErrors: [], kind: "unknown", urls: [] },
        stored: {
          url,
          httpStatus: null,
          rawContent: null,
          urlCount: null,
          isIndex: null,
          fetchError: err.message,
          overSizeCap: err.kind === "too_large",
        },
        parsed: null,
      };
    }
    throw err;
  }
}

/**
 * Fetches and deeply analyzes a site's sitemap(s): the declared/conventional
 * document, and — if it's a sitemap index — up to 10 child sitemaps. Unlike
 * Phase 6's `discoverSitemapUrls` (which silently swallows failures since
 * it only needs URLs to seed a crawl queue), this keeps every document's
 * fetch/parse outcome so document-level issues (HTTP errors, invalid XML)
 * can be reported.
 */
export async function analyzeSitemaps(origin: string, robotsSitemaps: string[]): Promise<SitemapAnalysisResult> {
  const candidates = robotsSitemaps.length > 0 ? robotsSitemaps : [new URL("/sitemap.xml", origin).toString()];

  const documents: SitemapDocumentInput[] = [];
  const stored: StoredSitemapDocument[] = [];
  const allUrls = new Set<string>();
  let found = false;

  for (const candidateUrl of candidates) {
    const result = await fetchAndParse(candidateUrl);
    const { document, parsed } = result;
    if (document.httpStatus !== null && document.httpStatus >= 200 && document.httpStatus < 300) found = true;
    documents.push(document);
    stored.push(result.stored);

    if (parsed?.kind === "sitemapindex") {
      for (const ref of parsed.sitemapRefs.slice(0, MAX_CHILD_SITEMAPS)) {
        const child = await fetchAndParse(ref.loc);
        documents.push(child.document);
        stored.push(child.stored);
        for (const u of child.document.urls) allUrls.add(u.loc);
      }
    } else if (parsed?.kind === "urlset") {
      for (const u of document.urls) allUrls.add(u.loc);
    }
  }

  return { documents, stored, allUrls: Array.from(allUrls), found };
}
