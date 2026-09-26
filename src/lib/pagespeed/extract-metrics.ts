/**
 * Pure extraction of the scores/metrics Phase 20 cares about from a
 * Lighthouse Result (LHR) object. Deliberately takes a loosely-typed shape
 * rather than importing Lighthouse's own types — the real LHR is a large,
 * mostly-irrelevant-to-us object, and this function only reaches into the
 * handful of fields the master doc's PageSpeed Module (Section 31) lists.
 * Kept dependency-free (no `lighthouse`/`chrome-launcher` imports) so it can
 * be unit-tested against a fixture without launching a browser.
 */

export interface LighthouseResultLike {
  lighthouseVersion?: string;
  categories?: {
    performance?: { score: number | null };
    accessibility?: { score: number | null };
    "best-practices"?: { score: number | null };
    seo?: { score: number | null };
  };
  audits?: Record<string, { numericValue?: number | null } | undefined>;
}

export interface ExtractedPageSpeedMetrics {
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  fcp: number | null;
  tbt: number | null;
  speedIndex: number | null;
  ttfb: number | null;
  lighthouseVersion: string | null;
}

/** Lighthouse category scores are 0-1; the DB stores 0-100 whole percentages. */
function toPercent(score: number | null | undefined): number | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  return Math.round(score * 100);
}

function numericAudit(
  audits: LighthouseResultLike["audits"],
  key: string
): number | null {
  const value = audits?.[key]?.numericValue;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function extractPageSpeedMetrics(lhr: LighthouseResultLike): ExtractedPageSpeedMetrics {
  const categories = lhr.categories ?? {};
  const audits = lhr.audits ?? {};

  return {
    performanceScore: toPercent(categories.performance?.score),
    accessibilityScore: toPercent(categories.accessibility?.score),
    bestPracticesScore: toPercent(categories["best-practices"]?.score),
    seoScore: toPercent(categories.seo?.score),
    lcp: numericAudit(audits, "largest-contentful-paint"),
    cls: numericAudit(audits, "cumulative-layout-shift"),
    // Lighthouse's lab-mode "Interaction to Next Paint" audit key; not every
    // Lighthouse version/report has enough interaction trace data to
    // populate this, so `null` (not measured) is an expected, valid result,
    // never coerced to 0.
    inp: numericAudit(audits, "interaction-to-next-paint") ?? numericAudit(audits, "experimental-interaction-to-next-paint"),
    fcp: numericAudit(audits, "first-contentful-paint"),
    tbt: numericAudit(audits, "total-blocking-time"),
    speedIndex: numericAudit(audits, "speed-index"),
    ttfb: numericAudit(audits, "server-response-time") ?? numericAudit(audits, "time-to-first-byte"),
    lighthouseVersion: lhr.lighthouseVersion ?? null,
  };
}

/**
 * Trims a full LHR down to the subset worth persisting: category
 * scores/titles and the specific audits Phase 20 extracts metrics from. The
 * full LHR includes per-request network detail, full trace data, and
 * (optionally) screenshots, which can run several MB per run and aren't
 * used anywhere downstream yet — persisting all of it would bloat the table
 * for no current benefit.
 */
const KEPT_AUDIT_KEYS = [
  "largest-contentful-paint",
  "cumulative-layout-shift",
  "interaction-to-next-paint",
  "experimental-interaction-to-next-paint",
  "first-contentful-paint",
  "total-blocking-time",
  "speed-index",
  "server-response-time",
  "time-to-first-byte",
  "interactive",
  "largest-contentful-paint-element",
  "layout-shift-elements",
  "render-blocking-resources",
  "uses-optimized-images",
  "uses-responsive-images",
  "unminified-css",
  "unminified-javascript",
  "unused-javascript",
  "unused-css-rules",
  "font-display",
  // Phase 21 (Performance Diagnostics) additions — these audits were
  // already computed by Lighthouse under Phase 20's `onlyCategories:
  // ["performance", ...]` run (all are "performance" category audits), but
  // Phase 20 didn't persist them since it only reported headline scores.
  // No Lighthouse re-run is required for future audits; this only widens
  // what gets trimmed-and-kept from the same run.
  "lcp-lazy-loaded",
  "long-tasks",
  "mainthread-work-breakdown",
  "bootup-time",
  "preload-key-requests",
];

export function trimLighthouseResult(lhr: LighthouseResultLike & Record<string, unknown>) {
  const audits = (lhr.audits ?? {}) as Record<string, unknown>;
  const trimmedAudits: Record<string, unknown> = {};
  for (const key of KEPT_AUDIT_KEYS) {
    if (key in audits) trimmedAudits[key] = audits[key];
  }

  return {
    lighthouseVersion: lhr.lighthouseVersion,
    fetchTime: (lhr as Record<string, unknown>).fetchTime,
    requestedUrl: (lhr as Record<string, unknown>).requestedUrl,
    finalUrl: (lhr as Record<string, unknown>).finalDisplayedUrl ?? (lhr as Record<string, unknown>).finalUrl,
    categories: lhr.categories,
    audits: trimmedAudits,
  };
}
