/**
 * Phase 25 — E-E-A-T / Trust.
 *
 * Pure, deterministic detection of the same kind of trust/credibility
 * markers Google's public E-E-A-T guidance describes wanting to see —
 * NEVER presented as a measurement of Google's actual internal E-E-A-T
 * ranking signal (master doc Section 79 #5). Every check here is a
 * heuristic over observable markup/URL/title evidence; false positives and
 * false negatives are possible and documented per-check below.
 *
 * ─── What is explicitly NOT re-implemented here ────────────────────────────
 *
 * Phase 24 (`src/lib/ai-search/readiness.ts`) already checks for
 * Organization/Person JSON-LD *existence* (its Entity Clarity/Source
 * Identity dimensions) and explicitly deferred deeper author/about-page
 * verification to this phase. Phase 11 (`src/lib/seo-rules/schema.ts`)
 * validates schema *structure* (required properties, URL consistency) but
 * does not check the `author` property specifically. This phase adds what
 * neither covers:
 *   - visible on-page authorship markup (byline text, rel="author"), not
 *     schema presence
 *   - the `author` property specifically on Article/BlogPosting/NewsArticle
 *     schema (a more precise signal than "some schema exists")
 *   - About/Contact/Privacy page existence, detected via URL/title pattern
 *     matching across the whole crawled site — a heuristic, not a guarantee
 *     that the page found is actually reachable/complete/accurate.
 */

export interface DimensionResult {
  key: string;
  label: string;
  status: "assessed" | "unassessed";
  score: number | null;
  evidence: string;
}

function round(n: number): number {
  return Math.round(n);
}

// ─── Author signal (page-level) ────────────────────────────────────────────

/** Schema types where an `author` property is a meaningful, expected E-E-A-T signal. */
const AUTHOR_SCHEMA_TYPES = new Set(["Article", "BlogPosting", "NewsArticle", "Report"]);

export interface AuthorSchemaInput {
  schemaType: string | null;
  hasAuthorProperty: boolean;
}

/** True if the `author` property was found specifically on an Article-family schema entity. */
export function hasArticleAuthorSchema(schemas: AuthorSchemaInput[]): boolean {
  return schemas.some((s) => s.schemaType && AUTHOR_SCHEMA_TYPES.has(s.schemaType) && s.hasAuthorProperty);
}

export interface AuthorSignalInput {
  hasAuthorByline: boolean;
  hasRelAuthorLink: boolean;
  hasVisibleDate: boolean;
  hasArticleAuthorSchema: boolean;
}

/**
 * Author/publisher-date signal score. Each of the four independent markers
 * (visible byline text, rel="author" link, author property on Article-family
 * schema, visible publish/modified date) contributes equally — no single
 * marker is required, since sites legitimately vary in which convention
 * they use.
 */
export function scoreAuthorSignal(input: AuthorSignalInput): DimensionResult {
  const markers = [
    { present: input.hasAuthorByline, label: "visible byline text" },
    { present: input.hasRelAuthorLink, label: 'rel="author" link' },
    { present: input.hasArticleAuthorSchema, label: "author property on Article-family schema" },
    { present: input.hasVisibleDate, label: "visible publish/modified date" },
  ];
  const found = markers.filter((m) => m.present);
  const score = round((found.length / markers.length) * 100);
  return {
    key: "authorSignal",
    label: "Author & Date Signal",
    status: "assessed",
    score,
    evidence:
      found.length > 0
        ? `Found: ${found.map((m) => m.label).join(", ")}.`
        : "No visible byline, rel=\"author\" link, Article-schema author property, or visible date found.",
  };
}

// ─── About / Contact / Privacy page detection (site-level) ────────────────
//
// URL-path and title-text heuristics only. Documented false-positive risk:
// a URL segment that merely *contains* the keyword as a substring of an
// unrelated word (e.g. "aboutface.com", "recontact-us-later") could
// false-positive if matched loosely — every pattern below requires the
// keyword to appear as its own path segment or as a whole word in the
// title, specifically to avoid that. Documented false-negative risk: a real
// About/Contact/Privacy page using an unconventional URL/title (e.g.
// "/our-story", "/get-in-touch") will not be detected — this is a known
// limitation of pattern matching without semantic understanding.

export interface CrawledPageRef {
  url: string;
  title: string | null;
}

function pathSegments(url: string): string[] {
  try {
    return new URL(url).pathname
      .toLowerCase()
      .split("/")
      .filter(Boolean)
      .flatMap((seg) => seg.split(/[-_]/)); // "/about-us" -> ["about", "us"]; "/contact_us" -> ["contact", "us"]
  } catch {
    return [];
  }
}

function findPageByPattern(
  pages: CrawledPageRef[],
  pathWords: string[],
  titlePattern: RegExp
): CrawledPageRef | null {
  for (const p of pages) {
    const segments = pathSegments(p.url);
    if (pathWords.some((w) => segments.includes(w))) return p;
    if (p.title && titlePattern.test(p.title)) return p;
  }
  return null;
}

export function findAboutPage(pages: CrawledPageRef[]): CrawledPageRef | null {
  return findPageByPattern(pages, ["about"], /\babout\b/i);
}

export function findContactPage(pages: CrawledPageRef[]): CrawledPageRef | null {
  return findPageByPattern(pages, ["contact"], /\bcontact\b/i);
}

export function findPrivacyPage(pages: CrawledPageRef[]): CrawledPageRef | null {
  return findPageByPattern(pages, ["privacy"], /\bprivacy\b/i);
}

export function findTermsPage(pages: CrawledPageRef[]): CrawledPageRef | null {
  return findPageByPattern(pages, ["terms", "tos"], /\bterms\b/i);
}

function pagePresenceDimension(key: string, label: string, found: CrawledPageRef | null): DimensionResult {
  return {
    key,
    label,
    status: "assessed",
    score: found ? 100 : 0,
    evidence: found
      ? `Found at ${found.url}${found.title ? ` (title: "${found.title}")` : ""} — URL/title pattern match, not a content-completeness guarantee.`
      : `No page matching a common ${label} URL/title pattern was found among crawled pages.`,
  };
}

export interface SiteTrustPagesInput {
  aboutPage: CrawledPageRef | null;
  contactPage: CrawledPageRef | null;
  privacyPage: CrawledPageRef | null;
  termsPage: CrawledPageRef | null;
}

export function scoreAboutPage(found: CrawledPageRef | null): DimensionResult {
  return pagePresenceDimension("aboutPage", "About page", found);
}
export function scoreContactPage(found: CrawledPageRef | null): DimensionResult {
  return pagePresenceDimension("contactPage", "Contact page", found);
}
export function scorePrivacyPage(found: CrawledPageRef | null): DimensionResult {
  return pagePresenceDimension("privacyPage", "Privacy Policy page", found);
}
export function scoreTermsPage(found: CrawledPageRef | null): DimensionResult {
  return pagePresenceDimension("termsPage", "Terms of Service page", found);
}

// ─── HTTPS (reused, not re-detected) ───────────────────────────────────────
//
// HTTPS is already fully covered by Phase 8's TECH_HTTPS rule
// (`src/lib/seo-rules/technical.ts`). This module exposes only a thin
// pass-through scorer so the Trust composite can include it without
// duplicating detection logic.

export function scoreHttps(isHttps: boolean): DimensionResult {
  return {
    key: "https",
    label: "HTTPS",
    status: "assessed",
    score: isHttps ? 100 : 0,
    evidence: isHttps ? "Site is served over HTTPS." : "Site is not served over HTTPS.",
    // Reuses the same isHttps fact Phase 8's TECH_HTTPS rule already computes — not a second detector.
  };
}

// ─── Composite Trust score (site-level) ────────────────────────────────────
//
// The master doc's Phase 25 section lists discrete signals (Author,
// Publisher, Organization, About, Contact, Privacy, Terms, HTTPS,
// References, Experience signals) without mandating a single number. A
// lightweight, transparently-averaged composite is added here for UI
// consistency with Phase 22 (Technical/On-page/Performance) and Phase 24
// (GEO/AEO/AIO) — equal-weight average of the assessed site-level Trust
// dimensions only (About, Contact, Privacy, HTTPS, and the site's average
// Author & Date Signal across content pages). "References"/"Experience
// signals" are named in the master doc but require semantic/cross-site
// judgment this deterministic engine cannot honestly produce — left
// unassessed, same discipline as Phase 24's unassessed GEO/AEO dimensions.
// Terms is tracked as its own dimension but NOT included in the composite,
// since the master doc's Phase 25 heading list separates it from the core
// Author/About/Contact/Privacy set named in the phase table's short
// description.

function average(scores: (number | null)[]): number | null {
  const valid = scores.filter((s): s is number => typeof s === "number");
  if (valid.length === 0) return null;
  return round(valid.reduce((s, v) => s + v, 0) / valid.length);
}

export interface SiteTrustResult {
  score: number | null;
  dimensions: DimensionResult[];
  unassessed: DimensionResult[];
}

export function unassessedTrustDimensions(): DimensionResult[] {
  return [
    {
      key: "references",
      label: "References",
      status: "unassessed",
      score: null,
      evidence: "Not measured — judging citation/source *quality* (vs. presence) requires semantic judgment. See Phase 24's Citation Readiness for the presence-only proxy this platform does assess.",
    },
    {
      key: "experienceSignals",
      label: "Experience Signals",
      status: "unassessed",
      score: null,
      evidence: "Not measured — first-hand experience (original examples, case studies, original media) requires semantic/NLP content judgment, deferred to Phase 29 (LLM/SLM integration).",
    },
  ];
}

export function computeSiteTrust(
  pagesInput: SiteTrustPagesInput,
  isHttps: boolean,
  authorSignalScores: number[]
): SiteTrustResult {
  const aboutDim = scoreAboutPage(pagesInput.aboutPage);
  const contactDim = scoreContactPage(pagesInput.contactPage);
  const privacyDim = scorePrivacyPage(pagesInput.privacyPage);
  const termsDim = scoreTermsPage(pagesInput.termsPage);
  const httpsDim = scoreHttps(isHttps);

  const avgAuthorScore = authorSignalScores.length > 0 ? average(authorSignalScores) : null;
  const authorDim: DimensionResult = {
    key: "authorSignalSiteAverage",
    label: "Author & Date Signal (site average)",
    status: avgAuthorScore === null ? "unassessed" : "assessed",
    score: avgAuthorScore,
    evidence:
      avgAuthorScore === null
        ? "No content-heavy pages were assessed for author/date signals."
        : `Averaged across ${authorSignalScores.length} content-heavy page(s).`,
  };

  const dimensions = [aboutDim, contactDim, privacyDim, httpsDim, authorDim, termsDim];
  const score = average([aboutDim.score, contactDim.score, privacyDim.score, httpsDim.score, authorDim.score]);

  return { score, dimensions, unassessed: unassessedTrustDimensions() };
}
