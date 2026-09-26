/**
 * Stage 3B — search-position arithmetic for the Keywords/SERP and Search
 * Console reports.
 *
 * Pure: no React, no DOM, no Next, no DB, so every rule below is directly
 * unit-testable (`tests/unit/report-position.test.ts`).
 *
 * ─── THE ONE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────
 *
 * SEARCH POSITION IS AN INVERTED SCALE: **LOWER IS BETTER**.
 *
 *   position 15 → 8   is an IMPROVEMENT  (moved up 7 places, green, up arrow)
 *   position  8 → 15  is a  DECLINE      (moved down 7 places, red, down arrow)
 *
 * Getting this backwards does not produce a small cosmetic bug — it inverts
 * the meaning of the entire report, painting every real ranking gain red and
 * every real loss green. So the sign handling lives in exactly one place,
 * delegates to `describeDelta`'s already-tested `lowerIsBetter` flag rather
 * than re-deriving it, and is pinned by explicit tests that assert the
 * direction in BOTH directions.
 *
 * Note the deliberate separation kept from `describeDelta`:
 *   - `direction` says which way the raw NUMBER moved (8 → 15 is "up").
 *   - `improvement` says whether that movement was GOOD (8 → 15 is `false`).
 * On an inverted metric those two disagree, and that disagreement is the
 * whole point. Colour follows `improvement`; the arrow follows the ranking
 * movement (`movedUp`), because a user reading a rank chart expects "up" to
 * mean "closer to #1".
 *
 * ─── The honesty rules that also apply here ──────────────────────────────
 *
 *  - A missing position is `null` and stays `null`. A keyword nobody found in
 *    the results they checked is NOT position 0 and NOT position 100 — it has
 *    no position, and it never participates in an average or a movement.
 *  - Fewer than two real observations produces NO movement at all, never a
 *    fabricated 0 or a flat line (Section 79 #3).
 *  - An average position is IMPRESSION-WEIGHTED, matching how Search Console
 *    itself aggregates. A plain mean over rows would over-weight the long tail
 *    of near-zero-impression queries and report a materially different (and
 *    wrong) headline — on the live dataset the two differ by 9 places.
 */

import { describeDelta } from "@/components/charts/format";

/**
 * Shared flag for every position metric in the product. Passed to
 * `describeDelta` / `DeltaChip` / `StatTile` so no call site can quietly
 * forget it, and so a grep for this constant finds every inverted metric.
 */
export const POSITION_LOWER_IS_BETTER = true;

/** Copy that must accompany every position figure, so the direction is never ambiguous. */
export const POSITION_HINT = "lower is better";

export type PositionDirection = "improved" | "declined" | "unchanged";

export interface PositionMovement {
  /**
   * Raw arithmetic change, `current - previous`. NEGATIVE means the position
   * number fell, which on this scale is an improvement.
   */
  delta: number;
  direction: PositionDirection;
  /** Drives colour. True when the position number went DOWN. */
  improvement: boolean;
  /** True when the ranking moved towards #1 — drives the arrow glyph. */
  movedUp: boolean;
  /** Absolute magnitude in places, always non-negative. */
  places: number;
  /** Short label, e.g. "Up 7 places". */
  label: string;
  /** Full sentence for a tooltip / screen reader, e.g. "Improved from 15 to 8 (7 places, lower is better)". */
  description: string;
}

/**
 * Movement between two observed positions, or `null` when there is nothing
 * honest to report.
 *
 * Returns `null` when either side is missing — a keyword with one observation
 * has no trend, and a keyword that was "not found" has no position to compare
 * against. It does NOT return null for an unchanged position: "held at 8" is a
 * real, measured outcome and is worth saying out loud, unlike a zero delta on
 * a growth metric where the absence of a chip says it better.
 */
export function describePositionMovement(
  previous: number | null | undefined,
  current: number | null | undefined
): PositionMovement | null {
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return null;
  if (current === null || current === undefined || !Number.isFinite(current)) return null;

  const delta = current - previous;
  const places = Math.abs(delta);
  const placesText = formatPlaces(places);

  if (delta === 0) {
    return {
      delta: 0,
      direction: "unchanged",
      improvement: false,
      movedUp: false,
      places: 0,
      label: "No change",
      description: `Unchanged at position ${formatPosition(current)}.`,
    };
  }

  // The single source of truth for the sign rule. `lowerIsBetter: true` makes
  // a NEGATIVE delta the improvement — do not re-derive this locally.
  const described = describeDelta(delta, { lowerIsBetter: POSITION_LOWER_IS_BETTER, decimals: 1 });
  const improvement = described?.improvement ?? delta < 0;

  return {
    delta,
    direction: improvement ? "improved" : "declined",
    improvement,
    movedUp: improvement,
    places,
    label: `${improvement ? "Up" : "Down"} ${placesText}`,
    description: `${improvement ? "Improved" : "Declined"} from position ${formatPosition(previous)} to ${formatPosition(
      current
    )} (${placesText}, ${POSITION_HINT}).`,
  };
}

function formatPosition(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPlaces(places: number): string {
  const text = Number.isInteger(places) ? String(places) : places.toFixed(1);
  return `${text} ${places === 1 ? "place" : "places"}`;
}

// ─── Distribution ──────────────────────────────────────────────────────────

export type PositionBucketKey = "top3" | "top10" | "top20" | "top50" | "beyond50" | "unranked";

export interface PositionBucket {
  key: PositionBucketKey;
  label: string;
  /** Screen-reader / tooltip clarification of the numeric range. */
  hint: string;
}

/**
 * Fixed, ordered buckets, best-first. The boundaries are the ones the search
 * industry already uses (top 3 = the block above the fold, top 10 = page one)
 * rather than invented tiers, so a reader does not have to learn a new scale.
 *
 * `unranked` is LAST and deliberately separate: "we looked and did not find
 * it" is a different fact from "it ranks badly", and folding the two together
 * would let an unmeasured keyword masquerade as a measured position.
 */
export const POSITION_BUCKETS: PositionBucket[] = [
  { key: "top3", label: "Positions 1–3", hint: "Top three results" },
  { key: "top10", label: "Positions 4–10", hint: "Rest of page one" },
  { key: "top20", label: "Positions 11–20", hint: "Page two" },
  { key: "top50", label: "Positions 21–50", hint: "Pages three to five" },
  { key: "beyond50", label: "Position 51+", hint: "Beyond position 50" },
  { key: "unranked", label: "Not ranked", hint: "No position recorded" },
];

/** Which bucket a single position falls in. `null` → `unranked`, never `beyond50`. */
export function positionBucket(position: number | null | undefined): PositionBucketKey {
  if (position === null || position === undefined || !Number.isFinite(position)) return "unranked";
  if (position <= 3) return "top3";
  if (position <= 10) return "top10";
  if (position <= 20) return "top20";
  if (position <= 50) return "top50";
  return "beyond50";
}

export interface PositionDistributionRow extends PositionBucket {
  count: number;
}

/**
 * Counts a set of positions into the fixed buckets.
 *
 * Every ranked bucket is always returned, INCLUDING the ones that are zero:
 * the denominator is known here, so "0 keywords in the top 3" is a real,
 * measured result and hiding it would flatter the site. The `unranked` bucket
 * is only returned when it genuinely contains something — an empty one would
 * be a row about an absence that did not occur.
 */
export function positionDistribution(positions: (number | null | undefined)[]): PositionDistributionRow[] {
  const counts = new Map<PositionBucketKey, number>();
  for (const position of positions) {
    const key = positionBucket(position);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return POSITION_BUCKETS.filter((bucket) => bucket.key !== "unranked" || (counts.get("unranked") ?? 0) > 0).map(
    (bucket) => ({ ...bucket, count: counts.get(bucket.key) ?? 0 })
  );
}

// ─── Aggregation ───────────────────────────────────────────────────────────

export interface WeightedPositionRow {
  position: number;
  impressions: number;
}

/**
 * Impression-weighted average position — the aggregation Search Console
 * itself performs, and the only one that produces a defensible site-level
 * headline.
 *
 * Returns `null` (never 0) when there are no rows or no impressions to weight
 * by: an unweighable set has no average, and reporting 0 would claim the site
 * ranks first for everything.
 */
export function weightedAveragePosition(rows: WeightedPositionRow[]): number | null {
  let weight = 0;
  let total = 0;
  for (const row of rows) {
    if (!Number.isFinite(row.position) || !Number.isFinite(row.impressions) || row.impressions <= 0) continue;
    weight += row.impressions;
    total += row.position * row.impressions;
  }
  if (weight <= 0) return null;
  return total / weight;
}

/**
 * Overall click-through rate from totals, as a 0-1 ratio.
 *
 * `null` when there were no impressions at all — 0/0 is not 0%. A real zero
 * numerator over a real positive denominator IS 0 and is returned as such.
 */
export function overallCtr(clicks: number, impressions: number): number | null {
  if (!Number.isFinite(clicks) || !Number.isFinite(impressions) || impressions <= 0) return null;
  return clicks / impressions;
}

// ─── Trends ────────────────────────────────────────────────────────────────

export interface PositionObservation {
  date: string;
  position: number | null;
  source: "manual" | "gsc";
}

export interface PositionTrendSummary {
  /** Most recent observation that carries a real position, or `null`. */
  latest: PositionObservation | null;
  /** The one before it that carries a real position, or `null`. */
  previous: PositionObservation | null;
  movement: PositionMovement | null;
  /** Best (lowest) position ever recorded, or `null`. */
  best: number | null;
  /** Worst (highest) position ever recorded, or `null`. */
  worst: number | null;
  /** How many observations carry a real position — the denominator behind everything above. */
  measuredCount: number;
  /** Total observations, including "not found" entries. */
  totalCount: number;
}

/**
 * Summarises a chronological list of observations.
 *
 * Observations WITHOUT a position ("not found in the results I checked") are
 * counted and preserved in `totalCount`, but never contribute a number: they
 * are excluded from best/worst and from the movement comparison. Treating a
 * "not found" as a large position number would be an invented measurement,
 * and treating it as position 0 would be the same lie in the other direction.
 *
 * The input is sorted by date here rather than trusted, so a caller that
 * concatenates two sources (manual log + a GSC-sourced point) cannot
 * accidentally compare the wrong pair.
 */
export function summarisePositionTrend(observations: PositionObservation[]): PositionTrendSummary {
  const ordered = [...observations].sort((a, b) => a.date.localeCompare(b.date));
  const measured = ordered.filter(
    (entry): entry is PositionObservation & { position: number } =>
      entry.position !== null && Number.isFinite(entry.position)
  );

  const latest = measured.length > 0 ? measured[measured.length - 1] : null;
  const previous = measured.length > 1 ? measured[measured.length - 2] : null;

  return {
    latest,
    previous,
    movement: describePositionMovement(previous?.position ?? null, latest?.position ?? null),
    best: measured.length > 0 ? Math.min(...measured.map((entry) => entry.position)) : null,
    worst: measured.length > 0 ? Math.max(...measured.map((entry) => entry.position)) : null,
    measuredCount: measured.length,
    totalCount: ordered.length,
  };
}
