import type { RuleViolation } from "./on-page";

const MAX_URLS_PER_SITEMAP = 50_000;

export interface SitemapDocumentInput {
  url: string;
  httpStatus: number | null;
  valid: boolean;
  xmlErrors: string[];
  kind: "urlset" | "sitemapindex" | "unknown";
  urls: { loc: string; lastmod: string | null }[];
}

function isValidAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Evaluates issues intrinsic to one sitemap document: fetchability, XML
 * validity, duplicate/invalid URLs, protocol consistency, size limits, and
 * lastmod coverage. Cross-referencing sitemap URLs against actual crawl
 * results (broken/noindex/canonical mismatch) is separate — see
 * `evaluateSitemapUrlCrossReference` — since it needs crawled-page data
 * this function doesn't have.
 */
export function evaluateSitemapDocumentIssues(doc: SitemapDocumentInput, siteIsHttps: boolean): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (doc.httpStatus === null || doc.httpStatus < 200 || doc.httpStatus >= 300) {
    violations.push({
      ruleKey: "SITEMAP_HTTP_ERROR",
      evidence: `${doc.url} returned ${doc.httpStatus === null ? "no response" : `HTTP ${doc.httpStatus}`}.`,
    });
    return violations; // nothing else to check on a document that didn't load
  }

  if (!doc.valid) {
    violations.push({
      ruleKey: "SITEMAP_INVALID_XML",
      evidence: `${doc.url}: ${doc.xmlErrors[0] ?? "invalid XML"}`,
    });
    return violations; // can't check URL-level issues on unparseable XML
  }

  if (doc.kind !== "urlset") return violations;

  if (doc.urls.length > MAX_URLS_PER_SITEMAP) {
    violations.push({
      ruleKey: "SITEMAP_TOO_MANY_URLS",
      evidence: `${doc.url} lists ${doc.urls.length} URLs (limit: ${MAX_URLS_PER_SITEMAP}).`,
    });
  }

  const seen = new Set<string>();
  let duplicateCount = 0;
  let invalidCount = 0;
  let httpOnHttpsCount = 0;
  let missingLastmodCount = 0;

  for (const entry of doc.urls) {
    if (seen.has(entry.loc)) duplicateCount++;
    seen.add(entry.loc);

    if (!isValidAbsoluteHttpUrl(entry.loc)) {
      invalidCount++;
    } else if (siteIsHttps && entry.loc.startsWith("http://")) {
      httpOnHttpsCount++;
    }

    if (!entry.lastmod) missingLastmodCount++;
  }

  if (duplicateCount > 0) {
    violations.push({
      ruleKey: "SITEMAP_DUPLICATE_URL",
      evidence: `${doc.url} has ${duplicateCount} duplicate URL entr${duplicateCount === 1 ? "y" : "ies"}.`,
    });
  }
  if (invalidCount > 0) {
    violations.push({
      ruleKey: "SITEMAP_INVALID_URL",
      evidence: `${doc.url} has ${invalidCount} invalid URL entr${invalidCount === 1 ? "y" : "ies"}.`,
    });
  }
  if (httpOnHttpsCount > 0) {
    violations.push({
      ruleKey: "SITEMAP_HTTP_URL_ON_HTTPS_SITE",
      evidence: `${doc.url} lists ${httpOnHttpsCount} http:// URL(s) on an HTTPS site.`,
    });
  }
  if (missingLastmodCount > 0) {
    violations.push({
      ruleKey: "SITEMAP_URL_MISSING_LASTMOD",
      evidence: `${missingLastmodCount} of ${doc.urls.length} sitemap URL(s) have no lastmod.`,
    });
  }

  return violations;
}

export interface CrawledPageSummary {
  statusCode: number | null;
  canonical: string | null;
  robots: string | null;
}

export interface SitemapUrlIssue {
  url: string;
  ruleKey: string;
  evidence: string;
}

/**
 * Cross-references sitemap URLs against this crawl's actual page results.
 * Only URLs that were crawled in this run can be checked (no extra
 * fetches here — that's what the crawler itself already did); a sitemap
 * URL that wasn't crawled is neither flagged nor assumed fine.
 */
export function evaluateSitemapUrlCrossReference(
  sitemapUrls: string[],
  crawledPagesByUrl: Map<string, CrawledPageSummary>
): SitemapUrlIssue[] {
  const issues: SitemapUrlIssue[] = [];

  for (const url of sitemapUrls) {
    const page = crawledPagesByUrl.get(url);
    if (!page) continue;

    if (page.statusCode !== null && page.statusCode >= 400) {
      issues.push({
        url,
        ruleKey: "SITEMAP_URL_BROKEN",
        evidence: `Sitemap lists ${url}, which returned HTTP ${page.statusCode}.`,
      });
    }

    if (page.robots && /noindex/i.test(page.robots)) {
      issues.push({
        url,
        ruleKey: "SITEMAP_URL_NOT_INDEXABLE",
        evidence: `Sitemap lists ${url}, which is marked noindex.`,
      });
    }

    if (page.canonical) {
      try {
        const canonicalNormalized = new URL(page.canonical, url).toString();
        const urlNormalized = new URL(url).toString();
        if (canonicalNormalized !== urlNormalized) {
          issues.push({
            url,
            ruleKey: "SITEMAP_URL_CANONICAL_MISMATCH",
            evidence: `Sitemap lists ${url}, whose canonical is ${page.canonical}.`,
          });
        }
      } catch {
        // Unparsable canonical — not this rule's concern.
      }
    }
  }

  return issues;
}
