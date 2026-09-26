import type { RuleViolation } from "./on-page";

const REDIRECT_CHAIN_WARNING_THRESHOLD = 2;

export interface TechnicalPageInput {
  finalUrl: string;
  statusCode: number;
  redirectCount: number;
  headers: Record<string, string | string[] | undefined>;
}

function headerValue(headers: TechnicalPageInput["headers"], name: string): string | null {
  const raw = headers[name];
  if (!raw) return null;
  return Array.isArray(raw) ? raw.join(", ") : raw;
}

/**
 * Evaluates the technical rules that only need this single response
 * (protocol, status, redirects, response headers). Cross-page checks
 * (orphan pages, duplicate URLs, robots.txt/sitemap presence) live in
 * their own functions below since they need the full crawl's data.
 */
export function evaluateTechnicalPageIssues(input: TechnicalPageInput): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const isHttps = new URL(input.finalUrl).protocol === "https:";

  if (!isHttps) {
    violations.push({ ruleKey: "TECH_NOT_HTTPS", evidence: `Final URL: ${input.finalUrl}` });
  }

  if (input.statusCode >= 400 && input.statusCode < 500) {
    violations.push({
      ruleKey: "TECH_CLIENT_ERROR_STATUS",
      evidence: `HTTP ${input.statusCode}`,
    });
  } else if (input.statusCode >= 500) {
    violations.push({
      ruleKey: "TECH_SERVER_ERROR_STATUS",
      evidence: `HTTP ${input.statusCode}`,
    });
  }

  if (input.redirectCount > 0) {
    violations.push({
      ruleKey: "TECH_REDIRECT_DETECTED",
      evidence: `${input.redirectCount} redirect hop(s) before reaching this content.`,
    });
    if (input.redirectCount > REDIRECT_CHAIN_WARNING_THRESHOLD) {
      violations.push({
        ruleKey: "TECH_REDIRECT_CHAIN_TOO_LONG",
        evidence: `${input.redirectCount} redirect hops.`,
      });
    }
  }

  const xRobotsTag = headerValue(input.headers, "x-robots-tag");
  if (xRobotsTag && /noindex/i.test(xRobotsTag)) {
    violations.push({
      ruleKey: "TECH_NOINDEX_VIA_HEADER",
      evidence: `X-Robots-Tag: ${xRobotsTag}`,
    });
  }

  if (isHttps && !headerValue(input.headers, "strict-transport-security")) {
    violations.push({
      ruleKey: "TECH_MISSING_HSTS",
      evidence: "No Strict-Transport-Security header on an HTTPS response.",
    });
  }
  if (!headerValue(input.headers, "x-content-type-options")) {
    violations.push({
      ruleKey: "TECH_MISSING_X_CONTENT_TYPE_OPTIONS",
      evidence: "No X-Content-Type-Options header.",
    });
  }
  if (!headerValue(input.headers, "referrer-policy")) {
    violations.push({
      ruleKey: "TECH_MISSING_REFERRER_POLICY",
      evidence: "No Referrer-Policy header.",
    });
  }

  return violations;
}

export interface SiteLevelIssue {
  ruleKey: "TECH_ROBOTS_TXT_MISSING" | "TECH_SITEMAP_MISSING";
  evidence: string;
}

/** Site-wide presence checks — attached to the homepage's page row by the caller. */
export function evaluateSiteLevelIssues(input: {
  robotsTxtFound: boolean;
  sitemapFound: boolean;
}): SiteLevelIssue[] {
  const issues: SiteLevelIssue[] = [];
  if (!input.robotsTxtFound) {
    issues.push({ ruleKey: "TECH_ROBOTS_TXT_MISSING", evidence: "No robots.txt found at the site root." });
  }
  if (!input.sitemapFound) {
    issues.push({
      ruleKey: "TECH_SITEMAP_MISSING",
      evidence: "No sitemap declared in robots.txt or found at /sitemap.xml.",
    });
  }
  return issues;
}

export interface CrawledPageRef {
  id: string;
  url: string;
}

export interface PageIssueRef {
  pageId: string;
  ruleKey: string;
  evidence: string;
}

/** Pages with no internal inbound link from any other page crawled in this run. */
export function evaluateOrphanPages(
  pages: CrawledPageRef[],
  linkedInternalUrls: Set<string>,
  startUrl: string
): PageIssueRef[] {
  const issues: PageIssueRef[] = [];
  for (const page of pages) {
    if (page.url === startUrl) continue; // the crawl's entry point never needs an inbound link
    if (!linkedInternalUrls.has(page.url)) {
      issues.push({
        pageId: page.id,
        ruleKey: "TECH_ORPHAN_PAGE",
        evidence: "No internal links from other crawled pages point to this URL.",
      });
    }
  }
  return issues;
}

/** Distinct URLs that share the same path and only differ by query string. */
export function evaluateDuplicateUrlVariants(pages: CrawledPageRef[]): PageIssueRef[] {
  const byPath = new Map<string, CrawledPageRef[]>();

  for (const page of pages) {
    let key: string;
    try {
      const u = new URL(page.url);
      key = `${u.origin}${u.pathname}`;
    } catch {
      continue;
    }
    const group = byPath.get(key);
    if (group) group.push(page);
    else byPath.set(key, [page]);
  }

  const issues: PageIssueRef[] = [];
  for (const group of byPath.values()) {
    if (group.length < 2) continue;
    for (const page of group) {
      issues.push({
        pageId: page.id,
        ruleKey: "TECH_DUPLICATE_URL_QUERY_VARIANT",
        evidence: `${group.length} URL variants share this path with different query strings.`,
      });
    }
  }
  return issues;
}

export interface InternalLinkRef {
  sourcePageId: string;
  targetUrl: string;
}

/** Internal links pointing at a path robots.txt disallows, flagged on the linking (source) page. */
export function evaluateBlockedInternalLinks(
  links: InternalLinkRef[],
  isAllowed: (pathWithQuery: string) => boolean
): PageIssueRef[] {
  const issues: PageIssueRef[] = [];
  const seenPerPage = new Set<string>();

  for (const link of links) {
    let pathWithQuery: string;
    try {
      const u = new URL(link.targetUrl);
      pathWithQuery = u.pathname + u.search;
    } catch {
      continue;
    }
    if (isAllowed(pathWithQuery)) continue;

    const dedupeKey = `${link.sourcePageId}:${pathWithQuery}`;
    if (seenPerPage.has(dedupeKey)) continue;
    seenPerPage.add(dedupeKey);

    issues.push({
      pageId: link.sourcePageId,
      ruleKey: "TECH_BLOCKED_BY_ROBOTS_TXT",
      evidence: `Links to ${pathWithQuery}, which robots.txt disallows.`,
    });
  }

  return issues;
}
