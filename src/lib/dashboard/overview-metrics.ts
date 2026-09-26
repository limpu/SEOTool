/**
 * Pure helpers for the website Overview dashboard.
 *
 * Everything here is deliberately free of React/DOM/DB so the honesty rules
 * it encodes are directly unit-testable (`tests/unit/overview-metrics.test.ts`).
 * The page itself is a Server Component that fetches; this module only does
 * arithmetic on what it fetched.
 *
 * The recurring rule across all of it (master doc Section 79 #3): a missing
 * prerequisite yields `null`, never `0`. "We measured this and it is zero" and
 * "we never measured this" are different facts and must stay distinguishable
 * all the way to the pixel.
 */

import { CWV_THRESHOLDS } from "@/lib/pagespeed/evaluate-thresholds";

// ─── Issues by severity ────────────────────────────────────────────────────

/** The fixed severity order. Never re-sorted by count — colour follows the entity, not its rank. */
export const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;
export type SeverityKey = (typeof SEVERITY_ORDER)[number];

export const SEVERITY_LABEL: Record<SeverityKey, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export interface SeveritySlice {
  key: SeverityKey;
  label: string;
  value: number;
  /** Percentage of all issues, 0-100, rounded to 1dp. `null` when there are no issues at all. */
  share: number | null;
}

/**
 * Severity breakdown in FIXED order with each tier's share of the total.
 *
 * When the total is 0 every share is `null`, not `0`: with no issues there is
 * no composition to describe, and printing "0%" for five tiers would imply we
 * computed a distribution that does not exist. A tier that genuinely has 0 of
 * a non-zero total does get a real `0` share — that is a measured fact.
 */
export function buildSeverityBreakdown(counts: Partial<Record<SeverityKey, number>>): {
  slices: SeveritySlice[];
  total: number;
} {
  const total = SEVERITY_ORDER.reduce((sum, key) => sum + (counts[key] ?? 0), 0);

  const slices = SEVERITY_ORDER.map((key) => {
    const value = counts[key] ?? 0;
    return {
      key,
      label: SEVERITY_LABEL[key],
      value,
      share: total > 0 ? Math.round((value / total) * 1000) / 10 : null,
    };
  });

  return { slices, total };
}

// ─── Search Console aggregates ─────────────────────────────────────────────

export interface GscRowLike {
  clicks: number;
  impressions: number;
  position: number;
}

export interface GscTotals {
  clicks: number;
  impressions: number;
  /** Site CTR = total clicks / total impressions (0-1). `null` with no impressions — not 0, which would claim a measured rate. */
  ctr: number | null;
  /** Impression-weighted average position, matching how Search Console itself aggregates. `null` with no impressions. */
  avgPosition: number | null;
}

/**
 * Aggregates GSC query rows into the four headline KPIs.
 *
 * Two deliberate choices:
 *  - CTR is `sum(clicks)/sum(impressions)`, NOT the mean of the per-row CTRs.
 *    Averaging rates weights a 1-impression query the same as a
 *    10,000-impression one and produces a number that matches nothing in
 *    Search Console.
 *  - Average position is impression-weighted for the same reason. This is
 *    Search Console's own definition.
 */
export function computeGscTotals(rows: GscRowLike[]): GscTotals {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;

  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weightedPosition += row.position * row.impressions;
  }

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    avgPosition: impressions > 0 ? Math.round((weightedPosition / impressions) * 10) / 10 : null,
  };
}

// ─── Core Web Vitals verdicts ──────────────────────────────────────────────

export type CwvBand = "good" | "needs-improvement" | "poor" | "unmeasured";

/**
 * Google publishes THREE Core Web Vitals bands, not two. The existing
 * `evaluate-thresholds.ts` only needs pass/fail (it decides whether to raise
 * an SEO issue), but a dashboard badge that says only "fail" for an LCP of
 * 2.6s and for one of 9s is throwing away a real distinction the user needs.
 *
 * Upper bounds below are Google's published "needs improvement" ceilings; the
 * "good" bound is reused from `CWV_THRESHOLDS` so the two modules can never
 * disagree about what "good" means.
 */
const NEEDS_IMPROVEMENT_CEILING = {
  lcp: 4000,
  cls: 0.25,
  inp: 500,
} as const;

export type CwvMetric = keyof typeof NEEDS_IMPROVEMENT_CEILING;

const GOOD_CEILING: Record<CwvMetric, number> = {
  lcp: CWV_THRESHOLDS.lcpMs,
  cls: CWV_THRESHOLDS.cls,
  inp: CWV_THRESHOLDS.inpMs,
};

/** `null` in → `"unmeasured"`, never `"poor"`. An unmeasured vital is not a failing one. */
export function cwvBand(metric: CwvMetric, value: number | null | undefined): CwvBand {
  if (value === null || value === undefined || !Number.isFinite(value)) return "unmeasured";
  if (value <= GOOD_CEILING[metric]) return "good";
  if (value <= NEEDS_IMPROVEMENT_CEILING[metric]) return "needs-improvement";
  return "poor";
}

/** The text label that must accompany every band colour — colour is never the sole carrier. */
export function cwvBandLabel(band: CwvBand): string {
  switch (band) {
    case "good":
      return "Good";
    case "needs-improvement":
      return "Needs work";
    case "poor":
      return "Poor";
    case "unmeasured":
      return "Not measured";
  }
}

// ─── PageSpeed score bands ─────────────────────────────────────────────────

/**
 * Lighthouse's own published score bands (0-49 poor, 50-89 needs improvement,
 * 90-100 good). Distinct from `scoreBand` in `charts/format.ts`, which bands
 * this product's OWN 0-100 SEO scores on this product's own thresholds —
 * conflating the two would present an internal heuristic as a Google metric.
 */
export function lighthouseBand(score: number | null | undefined): CwvBand {
  if (score === null || score === undefined || !Number.isFinite(score)) return "unmeasured";
  if (score >= 90) return "good";
  if (score >= 50) return "needs-improvement";
  return "poor";
}

// ─── AI Search / E-E-A-T dimension aggregation ─────────────────────────────

export interface DimensionLike {
  key: string;
  label: string;
  status: "assessed" | "unassessed";
  score: number | null;
  evidence?: string;
  reason?: string;
}

export interface AggregatedDimension {
  key: string;
  label: string;
  status: "assessed" | "unassessed";
  /** Mean of the per-page scores. Always `null` for an unassessed dimension. */
  score: number | null;
  /** How many pages contributed a real number. 0 for unassessed dimensions. */
  pagesContributing: number;
}

/**
 * Rolls per-page dimension results up to one site-level row per dimension.
 *
 * The critical rule: a dimension whose status is `unassessed` stays
 * `unassessed` with a `null` score — it is NEVER averaged to 0 and NEVER
 * dropped from the list. `src/lib/ai-search/readiness.ts` deliberately refuses
 * to score dimensions that need real semantic judgment (Answerability,
 * Original Information, Direct Answers, …); surfacing those as 0 would report
 * "we measured this and it is terrible" when the truth is "we did not measure
 * this". Hiding them instead would quietly overstate coverage. So they are
 * carried through explicitly, for the UI to render as "Not assessed".
 *
 * Dimension order follows the first page's order, which is the fixed order
 * `computePageAiSearchReadiness` emits — never re-sorted by score.
 */
export function aggregateDimensions(pages: { dimensions: DimensionLike[] }[]): AggregatedDimension[] {
  const order: string[] = [];
  const byKey = new Map<string, { label: string; status: "assessed" | "unassessed"; scores: number[] }>();

  for (const page of pages) {
    for (const dimension of page.dimensions) {
      let entry = byKey.get(dimension.key);
      if (!entry) {
        entry = { label: dimension.label, status: dimension.status, scores: [] };
        byKey.set(dimension.key, entry);
        order.push(dimension.key);
      }
      // Once any page reports a dimension as unassessed it stays unassessed:
      // a score averaged over only the pages that happened to be assessable
      // would silently change what the number means.
      if (dimension.status === "unassessed") entry.status = "unassessed";
      if (dimension.status === "assessed" && typeof dimension.score === "number" && Number.isFinite(dimension.score)) {
        entry.scores.push(dimension.score);
      }
    }
  }

  return order.map((key) => {
    const entry = byKey.get(key)!;
    const assessed = entry.status === "assessed" && entry.scores.length > 0;
    return {
      key,
      label: entry.label,
      status: entry.status,
      score: assessed ? Math.round(entry.scores.reduce((sum, v) => sum + v, 0) / entry.scores.length) : null,
      pagesContributing: entry.status === "assessed" ? entry.scores.length : 0,
    };
  });
}
