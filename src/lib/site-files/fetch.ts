/**
 * Phase 37 — fetching a site-level well-known file for STORAGE.
 *
 * ─── Security: this is the SSRF-sensitive edge of the feature ───────────────
 *
 * `fetchSiteFile` is reached from two places: the crawl (a URL derived from
 * the site's own origin) and the MANUAL-ADD endpoint (a URL typed by a user).
 * The second is a textbook SSRF vector, so this module has exactly ONE way to
 * reach the network — `safeFetch` (`src/lib/crawler/safe-fetch.ts`), which
 * validates the protocol, resolves DNS and rejects private/loopback/link-local
 * /metadata addresses, PINS the TCP connection to the address it validated
 * (closing the DNS-rebinding TOCTOU gap), re-validates every redirect hop, and
 * enforces a timeout and a byte cap. There is deliberately no `fetch()`,
 * `http.get()` or any other escape hatch in this file, and a blocked target is
 * reported honestly as unreachable rather than retried by another path.
 *
 * ─── Honesty: two different kinds of "too big" ──────────────────────────────
 *
 * `safeFetch` ABORTS a response that exceeds its byte cap rather than handing
 * back a partial body, so an over-cap file produces no content at all. That is
 * recorded as `truncated: true` with `rawContent: null` and a verbatim reason —
 * never as a short file that looks complete.
 *
 * Separately, a file that fetched fine but is larger than `STORE_CAP_BYTES` is
 * stored up to that cap and flagged `truncated: true`, with `sizeBytes`
 * carrying the REAL full size so the UI can say exactly how much is missing.
 */

import { safeFetch, CrawlFetchError } from "@/lib/crawler/safe-fetch";

/** The four file kinds a user can add by hand, and that this platform stores. */
export type SiteFileType = "sitemap_xml" | "sitemap_html" | "robots_txt" | "llms_txt";

export const SITE_FILE_TYPE_LABELS: Record<SiteFileType, string> = {
  sitemap_xml: "XML sitemap",
  sitemap_html: "HTML sitemap",
  robots_txt: "robots.txt",
  llms_txt: "llms.txt",
};

/**
 * Per-type network byte caps, matching the values the existing crawl-time
 * fetchers already use so a manually-added file is never fetched under looser
 * limits than a discovered one.
 */
export const FETCH_CAP_BYTES: Record<SiteFileType, number> = {
  sitemap_xml: 10 * 1024 * 1024, // same as analyzeSitemaps()
  sitemap_html: 0, // never fetched — see `isFetchable`
  robots_txt: 512 * 1024, // same as fetchRobotsRules()
  llms_txt: 2 * 1024 * 1024, // same as analyzeLlmsFiles()
};

/**
 * How much of a fetched body is kept in the database for display. A sitemap
 * can legitimately be megabytes of XML; storing and shipping all of it to a
 * report page helps nobody, so content is capped here and the row is flagged
 * as truncated with the real byte size recorded alongside.
 */
export const STORE_CAP_BYTES = 256 * 1024;

/**
 * An HTML sitemap is a human-readable page for visitors, not a machine-readable
 * index — there is nothing for this platform to parse in it, and fetching a
 * full HTML page to show as escaped source would be noise. It is recorded as a
 * link and a status only, and that absence is deliberate, not a failure.
 */
export function isFetchable(type: SiteFileType): boolean {
  return type !== "sitemap_html";
}

export interface SiteFileFetchOutcome {
  found: boolean;
  httpStatus: number | null;
  rawContent: string | null;
  /** The REAL byte size of the fetched body, even when only part of it was stored. */
  sizeBytes: number | null;
  truncated: boolean;
  /** Verbatim, user-facing reason no body was stored. NULL on success. */
  fetchError: string | null;
}

/** Maps a `CrawlFetchError` kind to a plain-language, non-leaky explanation. */
export function describeFetchFailure(err: CrawlFetchError): string {
  switch (err.kind) {
    case "blocked_protocol":
      return "Only http:// and https:// addresses can be fetched.";
    case "blocked_ip":
      return "This address is not permitted: it resolves to a private, loopback or internal network address.";
    case "dns_failure":
      return "This address could not be resolved — the hostname does not exist or DNS did not answer.";
    case "timeout":
      return "The request timed out before the file could be read.";
    case "too_large":
      return "The file is larger than the maximum size this platform will download, so none of it was stored.";
    case "too_many_redirects":
      return "The address redirected too many times to follow.";
    case "network_error":
      return "The file could not be fetched — the server did not return a usable response.";
    default:
      return "The file could not be fetched.";
  }
}

/**
 * Truncates a body to `STORE_CAP_BYTES`. Exported because the crawl fetches
 * robots.txt/sitemaps through their own existing parsers and needs the SAME
 * storage rule applied to what it persists.
 */
export function capForStorage(body: string): { content: string; sizeBytes: number; truncated: boolean } {
  const buffer = Buffer.from(body, "utf-8");
  if (buffer.byteLength <= STORE_CAP_BYTES) {
    return { content: body, sizeBytes: buffer.byteLength, truncated: false };
  }
  // `toString` on a byte-sliced buffer can end mid-codepoint; the replacement
  // character that produces is harmless in a <pre> and the row is flagged
  // truncated anyway, so no partial file is ever presented as complete.
  return { content: buffer.subarray(0, STORE_CAP_BYTES).toString("utf-8"), sizeBytes: buffer.byteLength, truncated: true };
}

/**
 * Fetches one site-level file through `safeFetch` and returns a storable
 * outcome. NEVER throws for an ordinary failure (missing file, blocked
 * address, timeout): a not-found or refused file is a real, reportable
 * finding, not an exception.
 */
export async function fetchSiteFile(url: string, type: SiteFileType): Promise<SiteFileFetchOutcome> {
  if (!isFetchable(type)) {
    return {
      found: false,
      httpStatus: null,
      rawContent: null,
      sizeBytes: null,
      truncated: false,
      fetchError: null,
    };
  }

  try {
    const res = await safeFetch(url, { maxBytes: FETCH_CAP_BYTES[type] });
    if (res.status < 200 || res.status >= 300) {
      return {
        found: false,
        httpStatus: res.status,
        rawContent: null,
        sizeBytes: null,
        truncated: false,
        fetchError: null,
      };
    }
    const { content, sizeBytes, truncated } = capForStorage(res.body);
    return { found: true, httpStatus: res.status, rawContent: content, sizeBytes, truncated, fetchError: null };
  } catch (err) {
    if (err instanceof CrawlFetchError) {
      return {
        found: false,
        httpStatus: null,
        rawContent: null,
        sizeBytes: null,
        truncated: err.kind === "too_large",
        fetchError: describeFetchFailure(err),
      };
    }
    throw err;
  }
}
