/**
 * Stage 3A — pure aggregation of Phase 24's PER-PAGE AI Search readiness
 * dimensions into the SITE-level rows the AI Search Overview shows.
 *
 * No React, no DOM, no DB — unit-tested in
 * `tests/unit/report-ai-dimensions.test.ts`.
 *
 * `computeWebsiteAiSearch` already averages the three COMPOSITES (GEO / AEO /
 * AIO) across pages, but it deliberately does not average the individual
 * dimensions — nothing needed that until now. This file adds exactly that and
 * nothing else; `src/lib/ai-search/*` is not modified.
 *
 * ─── The one rule this file exists to enforce ────────────────────────────
 *
 * A dimension Phase 24 marks `unassessed` MUST stay `unassessed` after
 * aggregation. Four GEO dimensions (Answerability, Evidence, Original
 * Information, Semantic Completeness) and three AEO ones (Direct Answers,
 * Evidence, Answer Completeness) are permanently unassessed by design: they
 * need semantic judgment a deterministic markup analyser cannot honestly
 * produce, and Phase 24's file-level comment explains each one. Averaging
 * `null`s into a 0 — or dropping the rows so the page looks complete — would
 * turn a documented honesty decision into a fabricated verdict. So:
 *
 *   - a dimension assessed on at least one page  → `assessed`, averaged over
 *     ONLY the pages that produced a real number, with that count reported;
 *   - a dimension assessed on no page at all     → `unassessed`, score `null`,
 *     carrying Phase 24's own `reason` text verbatim.
 *
 * The second case is not hypothetical even for normally-assessable
 * dimensions: Content Chunkability is `unassessed` on a page with zero words.
 */

import type { DimensionResult } from "@/lib/ai-search/readiness";

export interface AggregatedDimension {
  key: string;
  label: string;
  status: "assessed" | "unassessed";
  /** Mean of the assessed pages' scores, or `null`. Never 0-as-a-stand-in. */
  score: number | null;
  /** How many pages produced a real score for this dimension. */
  pagesAssessed: number;
  /** How many pages were looked at for this dimension in total. */
  pagesConsidered: number;
  /** Phase 24's own explanation for an unassessed dimension, verbatim. */
  reason: string | null;
  /** One page's evidence string, kept as an illustrative example. Never rewritten. */
  exampleEvidence: string | null;
}

/**
 * Aggregate one dimension SET (e.g. every page's `geo.dimensions`) into
 * site-level rows, preserving the declared dimension order of the first page
 * that has them so the list does not reshuffle between crawls.
 */
export function aggregateDimensions(perPageDimensions: DimensionResult[][]): AggregatedDimension[] {
  const order: string[] = [];
  const buckets = new Map<
    string,
    {
      label: string;
      scores: number[];
      considered: number;
      reason: string | null;
      exampleEvidence: string | null;
    }
  >();

  for (const dimensions of perPageDimensions) {
    for (const dimension of dimensions) {
      let bucket = buckets.get(dimension.key);
      if (!bucket) {
        bucket = {
          label: dimension.label,
          scores: [],
          considered: 0,
          reason: null,
          exampleEvidence: null,
        };
        buckets.set(dimension.key, bucket);
        order.push(dimension.key);
      }
      bucket.considered += 1;

      if (dimension.status === "assessed" && typeof dimension.score === "number") {
        bucket.scores.push(dimension.score);
        // Keep the evidence of the first ASSESSED page as the example — an
        // unassessed page's "Not measured." says nothing illustrative.
        if (bucket.exampleEvidence === null) bucket.exampleEvidence = dimension.evidence;
      } else if (bucket.reason === null) {
        // `reason` is where Phase 24 explains WHY it will not score this.
        // Fall back to `evidence` only when no reason was supplied.
        bucket.reason = dimension.reason ?? dimension.evidence ?? null;
      }
    }
  }

  return order.map((key) => {
    const bucket = buckets.get(key)!;
    const assessed = bucket.scores.length > 0;
    return {
      key,
      label: bucket.label,
      status: assessed ? "assessed" : "unassessed",
      score: assessed ? Math.round(bucket.scores.reduce((sum, s) => sum + s, 0) / bucket.scores.length) : null,
      pagesAssessed: bucket.scores.length,
      pagesConsidered: bucket.considered,
      reason: assessed ? null : bucket.reason,
      exampleEvidence: bucket.exampleEvidence,
    };
  });
}

/**
 * The distinct ASSESSED dimensions for ONE page, across its GEO/AEO/AIO sets.
 *
 * Phase 24 deliberately reuses the same dimension object in more than one
 * composite (Entity Clarity feeds all three; Question Coverage feeds GEO and
 * AEO). Rendering the three sets verbatim in a per-page drill-down therefore
 * repeats identical rows two or three times and roughly triples what has to
 * be sent to the browser for no added information. Collapsing on `key` shows
 * each real signal once.
 *
 * Unassessed rows are excluded here ON PURPOSE and are NOT lost: they are
 * site-constant (the same four GEO and three AEO dimensions are unassessed on
 * every page, for reasons about this platform's capabilities rather than about
 * any page), so the Overview states them once at site level instead of
 * repeating an identical "Not assessed" row on all hundred pages.
 */
export function uniqueAssessedDimensions(dimensionSets: DimensionResult[][]): DimensionResult[] {
  const seen = new Set<string>();
  const out: DimensionResult[] = [];
  for (const set of dimensionSets) {
    for (const dimension of set) {
      if (dimension.status !== "assessed") continue;
      if (seen.has(dimension.key)) continue;
      seen.add(dimension.key);
      out.push(dimension);
    }
  }
  return out;
}

/**
 * Splits aggregated rows into the two groups the UI renders separately.
 *
 * They are shown as two labelled groups rather than one mixed list precisely
 * so "scored 0" and "not assessed" cannot be skim-read as the same thing —
 * a measured 0 (e.g. "no Organization schema anywhere") is a real, actionable
 * finding, while an unassessed dimension is a statement about this platform's
 * limits, not about the site.
 */
export function splitAssessed(dimensions: AggregatedDimension[]): {
  assessed: AggregatedDimension[];
  unassessed: AggregatedDimension[];
} {
  return {
    assessed: dimensions.filter((d) => d.status === "assessed"),
    unassessed: dimensions.filter((d) => d.status === "unassessed"),
  };
}
