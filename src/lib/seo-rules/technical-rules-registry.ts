import type { RuleDefinition } from "./rules-registry";

/**
 * Technical SEO rules (Phase 8). Deliberately does not re-check canonical
 * or hreflang — those signals are already covered by the on-page rules
 * (Phase 7, ONPAGE_CANONICAL_* / ONPAGE_HREFLANG_*) and duplicating them
 * here would just produce two issues for the same evidence.
 */
export const TECHNICAL_RULES: RuleDefinition[] = [
  // ─── HTTPS ───────────────────────────────────────────────────────────────
  {
    ruleKey: "TECH_NOT_HTTPS",
    category: "technical",
    severity: "high",
    title: "Page is not served over HTTPS",
    description: "This page was reached over plain HTTP rather than HTTPS.",
    recommendation: "Serve the site over HTTPS and redirect HTTP requests to HTTPS.",
    impact: "HTTPS is a confirmed ranking signal and required for user trust and many browser features.",
  },

  // ─── HTTP Status ─────────────────────────────────────────────────────────
  {
    ruleKey: "TECH_CLIENT_ERROR_STATUS",
    category: "technical",
    severity: "medium",
    title: "Page returns a client error status",
    description: "The page responded with a 4xx status code.",
    recommendation: "Fix the broken page, or remove/update links and sitemap entries pointing to it.",
    impact: "4xx pages cannot be indexed and waste crawl budget.",
  },
  {
    ruleKey: "TECH_SERVER_ERROR_STATUS",
    category: "technical",
    severity: "high",
    title: "Page returns a server error status",
    description: "The page responded with a 5xx status code.",
    recommendation: "Investigate the server error; 5xx responses can cause search engines to reduce crawl rate.",
    impact: "Repeated server errors can affect crawling and indexing of the whole site.",
  },

  // ─── Redirects ───────────────────────────────────────────────────────────
  {
    ruleKey: "TECH_REDIRECT_DETECTED",
    category: "technical",
    severity: "info",
    title: "URL redirects before reaching final content",
    description: "The originally requested URL redirected at least once before returning content.",
    recommendation: "Link directly to the final URL where possible to save a redirect hop.",
    impact: "Redirects add latency and slightly dilute link equity.",
  },
  {
    ruleKey: "TECH_REDIRECT_CHAIN_TOO_LONG",
    category: "technical",
    severity: "medium",
    title: "Long redirect chain",
    description: "The URL required more than two redirect hops before returning content.",
    recommendation: "Shorten the redirect chain to at most one hop.",
    impact: "Long redirect chains slow page loads and can cause search engines to give up following them.",
  },

  // ─── Indexability / Robots ───────────────────────────────────────────────
  {
    ruleKey: "TECH_NOINDEX_VIA_HEADER",
    category: "technical",
    severity: "medium",
    title: "Noindex set via X-Robots-Tag header",
    description: "The HTTP response's X-Robots-Tag header includes noindex.",
    recommendation: "Confirm this page is intentionally excluded from indexing via the response header.",
    impact: "This blocks indexing even if on-page robots meta tags say otherwise.",
  },
  {
    ruleKey: "TECH_BLOCKED_BY_ROBOTS_TXT",
    category: "technical",
    severity: "medium",
    title: "Internally linked page is blocked by robots.txt",
    description: "A page reachable via internal links is disallowed by robots.txt.",
    recommendation: "Remove the internal link, or update robots.txt if this page should be crawlable.",
    impact: "Linking to disallowed pages wastes link equity on pages search engines won't crawl.",
  },
  {
    ruleKey: "TECH_ROBOTS_TXT_MISSING",
    category: "technical",
    severity: "low",
    title: "robots.txt not found",
    description: "No robots.txt was found at the site root.",
    recommendation: "Consider adding a robots.txt, even a permissive one, for explicit crawl guidance.",
    impact: "Without robots.txt, crawlers default to allowing everything, which may not be intended.",
  },

  // ─── Sitemap ─────────────────────────────────────────────────────────────
  {
    ruleKey: "TECH_SITEMAP_MISSING",
    category: "technical",
    severity: "medium",
    title: "No sitemap found",
    description: "No sitemap was declared in robots.txt or found at the conventional /sitemap.xml location.",
    recommendation: "Publish a sitemap.xml and declare it in robots.txt to help search engines discover pages.",
    impact: "Sitemaps help search engines discover and prioritize pages, especially on larger sites.",
  },

  // ─── Duplicate URLs ──────────────────────────────────────────────────────
  {
    ruleKey: "TECH_DUPLICATE_URL_QUERY_VARIANT",
    category: "technical",
    severity: "medium",
    title: "Duplicate URL via query parameters",
    description: "Multiple crawled URLs share the same path but differ only by query string.",
    recommendation: "Use a self-referencing canonical, or consolidate/redirect the parameter variants.",
    impact: "Query-parameter duplicates split ranking signals across multiple URLs for the same content.",
  },

  // ─── Orphan Pages ────────────────────────────────────────────────────────
  {
    ruleKey: "TECH_ORPHAN_PAGE",
    category: "technical",
    severity: "medium",
    title: "Orphan page",
    description: "This page was crawled (via sitemap) but has no internal links pointing to it from any other crawled page.",
    recommendation: "Add internal links to this page from relevant related content.",
    impact: "Pages with no internal links are harder for search engines and users to discover.",
  },

  // ─── Security Headers ────────────────────────────────────────────────────
  {
    ruleKey: "TECH_MISSING_HSTS",
    category: "technical",
    severity: "low",
    title: "Missing Strict-Transport-Security header",
    description: "The HTTPS response did not include a Strict-Transport-Security (HSTS) header.",
    recommendation: "Add an HSTS header to enforce HTTPS on future visits.",
    fixExample: "Strict-Transport-Security: max-age=63072000; includeSubDomains",
    impact: "HSTS protects against protocol-downgrade and cookie-hijacking attacks.",
  },
  {
    ruleKey: "TECH_MISSING_X_CONTENT_TYPE_OPTIONS",
    category: "technical",
    severity: "low",
    title: "Missing X-Content-Type-Options header",
    description: "The response did not include an X-Content-Type-Options header.",
    recommendation: "Add X-Content-Type-Options: nosniff to prevent MIME-type sniffing.",
    fixExample: "X-Content-Type-Options: nosniff",
    impact: "Without this header, browsers may MIME-sniff responses in ways that enable certain attacks.",
  },
  {
    ruleKey: "TECH_MISSING_REFERRER_POLICY",
    category: "technical",
    severity: "info",
    title: "Missing Referrer-Policy header",
    description: "The response did not include a Referrer-Policy header.",
    recommendation: "Add a Referrer-Policy header to control what referrer data is sent on navigation.",
    fixExample: "Referrer-Policy: strict-origin-when-cross-origin",
    impact: "Without an explicit policy, browsers fall back to defaults that may leak more referrer data than intended.",
  },
];

export const TECHNICAL_RULES_BY_KEY = new Map(TECHNICAL_RULES.map((r) => [r.ruleKey, r]));
