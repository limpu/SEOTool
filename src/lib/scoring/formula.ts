/**
 * Phase 22 — Scoring formula (pure, deterministic, no I/O).
 *
 * Every score this platform produces is a proprietary product score derived
 * from real, already-persisted evidence (`seo_issues` rows and Lighthouse's
 * own category scores) — never an AI-guessed or fabricated number, per
 * Section 79 #3/#5 of the master doc. This module documents the exact
 * formula so a paying customer's score is always explainable and
 * reproducible from the same inputs.
 *
 * ─── Category (issue-based) scores ─────────────────────────────────────────
 *
 * Each category score starts at 100 and subtracts points per issue found in
 * that category, scaled by severity:
 *
 *   critical: -20 per issue
 *   high:     -10 per issue
 *   medium:   -5  per issue
 *   low:      -2  per issue
 *   info:      0  per issue   (informational issues never penalize — many
 *                              are intentional choices, e.g. Phase 13/19's
 *                              info-level AI-crawler-block rules, or
 *                              Phase 18's LLMS_TXT_MISSING; docking points
 *                              for them would misrepresent a deliberate
 *                              decision as a defect)
 *
 * To keep the score proportionate — so that, say, 50 low-severity issues on
 * a large page don't zero out a score the way a handful of criticals
 * rightly would — each severity's total contribution is capped before
 * subtraction:
 *
 *   critical bucket capped at -100 (>=5 criticals already floors the score)
 *   high     bucket capped at -80  (>=8 highs already floors the score)
 *   medium   bucket capped at -60  (>=12 mediums already floors the score)
 *   low      bucket capped at -30  (any number of lows costs at most 30 pts)
 *
 * Final category score = clamp(100 - sum(capped bucket penalties), 0, 100).
 *
 * ─── Category → issue-category mapping ─────────────────────────────────────
 *
 * `seo_issues.category` values actually produced across Phases 7-21 are
 * exactly `on_page`, `technical`, `performance`, `schema` (confirmed by
 * inspecting every rule registry — see read.md Phase 22 write-up). This
 * phase implements the 4 scores explicitly scoped by the task: Technical,
 * On-page, Performance, Overall.
 *
 *   Technical score = issues where category IN ('technical', 'schema')
 *     Structured data (schema.org/JSON-LD) is infrastructure-level markup,
 *     not page copy, so it is folded into Technical rather than On-page or
 *     given its own bucket (a dedicated Schema score is deferred — see
 *     read.md decisions log for the full reasoning and what would need to
 *     change to split it out later).
 *   On-page score  = issues where category = 'on_page'
 *   Performance score = Lighthouse's own category "performance" score
 *     (0-100), pulled directly from the most recent completed
 *     `pagespeed_audits` row(s) — NOT re-derived from issue counts, since
 *     Lighthouse's model is already a real, well-established, third-party
 *     scoring engine (Phase 20/21). If both mobile and desktop audits
 *     exist, the average is used; if only one strategy has run, that one is
 *     used; if neither has ever run, Performance is `null` ("not measured"),
 *     never fabricated as 100 or 0.
 *
 * ─── Overall score ──────────────────────────────────────────────────────────
 *
 * Weighted average of the three category scores:
 *
 *   Technical:   35%
 *   On-page:     35%
 *   Performance: 30%
 *
 * Technical and On-page are weighted equally and highest because they are
 * the foundational, always-measurable pillars (Section 80's architecture
 * diagram lists Technical SEO and On-Page before Performance). Performance
 * is weighted slightly lower not because it matters less, but because it
 * can legitimately be "not yet measured" (no PageSpeed audit run yet) for a
 * freshly-crawled site, whereas Technical/On-page are always computable the
 * moment a crawl completes — a lower weight limits how much a missing,
 * optional signal can swing the headline number.
 *
 * If Performance is unmeasured, Overall is computed from Technical/On-page
 * only, reweighted to 50/50 (never silently treated as 0 or 100). If ALL
 * three inputs are unmeasured (no crawl data at all), Overall is `null`.
 *
 * These are proprietary product scores, not Google ranking scores and not a
 * guarantee of search-ranking correlation (Section 79 #4/#5) — UI/API copy
 * must not imply otherwise.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface ScoredIssue {
  severity: Severity;
}

export interface CategoryScoreBreakdown {
  score: number;
  issueCounts: Record<Severity, number>;
  penalties: Record<Severity, number>;
  totalPenalty: number;
}

const PER_ISSUE_PENALTY: Record<Severity, number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
  info: 0,
};

const BUCKET_CAP: Record<Severity, number> = {
  critical: 100,
  high: 80,
  medium: 60,
  low: 30,
  info: 0,
};

/**
 * Canonical critical→info severity ordering, exported so other modules
 * (e.g. Phase 23's recommendation-engine prioritization) reuse this single
 * source of truth instead of redefining their own severity order.
 */
export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

/**
 * Per-issue penalty weights, exported so Phase 23's recommendation engine
 * can reuse the same severity-weight vocabulary this formula already
 * establishes, rather than inventing a second set of weights.
 */
export const SEVERITY_WEIGHT: Record<Severity, number> = PER_ISSUE_PENALTY;

const ALL_SEVERITIES: Severity[] = SEVERITY_ORDER;

export function computeCategoryScore(issues: ScoredIssue[]): CategoryScoreBreakdown {
  const issueCounts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const issue of issues) {
    issueCounts[issue.severity] += 1;
  }

  const penalties: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  let totalPenalty = 0;
  for (const sev of ALL_SEVERITIES) {
    const raw = issueCounts[sev] * PER_ISSUE_PENALTY[sev];
    const capped = Math.min(raw, BUCKET_CAP[sev]);
    penalties[sev] = capped;
    totalPenalty += capped;
  }

  const score = Math.max(0, Math.min(100, 100 - totalPenalty));

  return { score, issueCounts, penalties, totalPenalty };
}

export interface OverallScoreInput {
  technical: number | null;
  onPage: number | null;
  performance: number | null;
}

export interface OverallScoreResult {
  score: number | null;
  weights: { technical: number; onPage: number; performance: number };
}

const BASE_WEIGHTS = { technical: 0.35, onPage: 0.35, performance: 0.3 };

export function computeOverallScore(input: OverallScoreInput): OverallScoreResult {
  const components: { key: keyof OverallScoreInput; value: number; weight: number }[] = [];
  if (input.technical !== null) components.push({ key: "technical", value: input.technical, weight: BASE_WEIGHTS.technical });
  if (input.onPage !== null) components.push({ key: "onPage", value: input.onPage, weight: BASE_WEIGHTS.onPage });
  if (input.performance !== null) components.push({ key: "performance", value: input.performance, weight: BASE_WEIGHTS.performance });

  if (components.length === 0) {
    return { score: null, weights: { technical: 0, onPage: 0, performance: 0 } };
  }

  const weightSum = components.reduce((s, c) => s + c.weight, 0);
  const weighted = components.reduce((s, c) => s + c.value * (c.weight / weightSum), 0);

  const weights = { technical: 0, onPage: 0, performance: 0 };
  for (const c of components) {
    weights[c.key] = Math.round((c.weight / weightSum) * 100) / 100;
  }

  return { score: Math.round(weighted), weights };
}

/**
 * Average Lighthouse's own "performance" category score (0-100) across
 * whichever strategies (mobile/desktop) have a completed audit. `null` when
 * neither has run — never fabricated.
 */
export function computePerformanceScore(scores: (number | null | undefined)[]): number | null {
  const valid = scores.filter((s): s is number => typeof s === "number" && Number.isFinite(s));
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((s, v) => s + v, 0) / valid.length);
}
