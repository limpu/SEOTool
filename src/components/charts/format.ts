/**
 * Value formatting for the dashboard widgets — pure, no React/DOM/I/O, so
 * the honesty rules it encodes are directly unit-testable
 * (`tests/unit/charts-format.test.ts`).
 *
 * The single most important thing this module does is keep "we measured this
 * and it is zero" distinguishable from "we have not measured this"
 * (master doc Section 79 #3). `null`/`undefined` never becomes `0`, never
 * becomes a dash that could be read as a number, and never silently
 * disappears — it becomes an explicit "Not measured"-class string that the
 * caller renders in muted ink. A genuine measured `0` (e.g. zero critical
 * issues) is a real, good result and formats as `0`.
 */

export interface MetricDisplay {
  /** False when the underlying value is missing — render in muted ink, never as a number. */
  available: boolean;
  text: string;
}

export interface FormatMetricOptions {
  /** Copy for the missing case. Defaults to "Not measured". */
  unavailable?: string;
  suffix?: string;
  decimals?: number;
  /** Group thousands (default true). */
  grouped?: boolean;
}

/**
 * The one gate every widget number passes through. `null`/`undefined`/NaN →
 * unavailable; anything else (including `0`) → a real formatted number.
 */
export function formatMetric(value: number | null | undefined, options: FormatMetricOptions = {}): MetricDisplay {
  const { unavailable = "Not measured", suffix = "", decimals, grouped = true } = options;

  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { available: false, text: unavailable };
  }

  const text =
    decimals === undefined
      ? grouped
        ? value.toLocaleString("en-US")
        : String(value)
      : value.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          useGrouping: grouped,
        });

  return { available: true, text: `${text}${suffix}` };
}

/** Whole-number count with thousands separators. `0` is a real answer, `null` is not. */
export function formatCount(value: number | null | undefined, unavailable = "No data"): MetricDisplay {
  return formatMetric(value, { unavailable, decimals: 0 });
}

/** A 0-1 ratio as a percentage. Pass `0.0342` to get `3.4%`. */
export function formatRatioAsPercent(
  ratio: number | null | undefined,
  decimals = 1,
  unavailable = "Not measured"
): MetricDisplay {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) {
    return { available: false, text: unavailable };
  }
  return formatMetric(ratio * 100, { decimals, suffix: "%" });
}

/** Milliseconds → "480 ms" / "2.50 s". Sub-second values stay in ms so small differences remain visible. */
export function formatMilliseconds(ms: number | null | undefined, unavailable = "Not measured"): MetricDisplay {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return { available: false, text: unavailable };
  }
  if (ms < 1000) return { available: true, text: `${Math.round(ms)} ms` };
  return { available: true, text: `${(ms / 1000).toFixed(2)} s` };
}

/** CLS is unitless and small — 3dp, matching how Lighthouse reports it. */
export function formatCls(value: number | null | undefined, unavailable = "Not measured"): MetricDisplay {
  return formatMetric(value, { unavailable, decimals: 3 });
}

// ─── Score bands ───────────────────────────────────────────────────────────

export type ScoreBand = "good" | "warning" | "serious" | "critical" | "unmeasured";

/**
 * Maps a 0-100 product score onto the reserved status ramp. `null` maps to
 * `unmeasured` — NOT to `critical`: a site nobody has crawled yet is not a
 * failing site, and colouring it red would be a fabricated verdict.
 */
export function scoreBand(score: number | null | undefined): ScoreBand {
  if (score === null || score === undefined || !Number.isFinite(score)) return "unmeasured";
  if (score >= 80) return "good";
  if (score >= 60) return "warning";
  if (score >= 40) return "serious";
  return "critical";
}

/** Text label that must accompany every status colour — colour is never the sole carrier. */
export function scoreBandLabel(band: ScoreBand): string {
  switch (band) {
    case "good":
      return "Good";
    case "warning":
      return "Needs work";
    case "serious":
      return "Poor";
    case "critical":
      return "Critical";
    case "unmeasured":
      return "Not measured";
  }
}

// ─── Deltas ────────────────────────────────────────────────────────────────

export interface DeltaDisplay {
  /** Which way the raw number moved. */
  direction: "up" | "down";
  /** Whether that movement is an improvement — this is what drives colour. */
  improvement: boolean;
  /** Signed, formatted magnitude, e.g. "+4" or "−0.8". */
  text: string;
  /** Screen-reader/tooltip sentence, e.g. "Improved by 0.8 (lower is better)". */
  description: string;
}

export interface DeltaOptions {
  /**
   * True for inverted-scale metrics — chiefly Search Console's Average
   * Position, where moving from 12 to 8 is a RANKING IMPROVEMENT even though
   * the raw delta is negative. Getting this backwards paints real progress
   * red, so it is an explicit, tested flag rather than an inferred one.
   */
  lowerIsBetter?: boolean;
  decimals?: number;
  suffix?: string;
}

/**
 * Formats a delta chip, or returns `null` when there is nothing honest to
 * show. `null`/`undefined` (no comparable baseline — e.g. only one crawl run
 * has ever completed) yields NO chip at all rather than a fake "0%" with a
 * flat arrow, and an exactly-zero delta also yields no chip: an arrow implies
 * movement, and "unchanged" is better said by the absence of a chip than by a
 * chip claiming a direction.
 */
export function describeDelta(delta: number | null | undefined, options: DeltaOptions = {}): DeltaDisplay | null {
  const { lowerIsBetter = false, decimals = 0, suffix = "" } = options;

  if (delta === null || delta === undefined || !Number.isFinite(delta) || delta === 0) return null;

  const direction = delta > 0 ? "up" : "down";
  const improvement = lowerIsBetter ? delta < 0 : delta > 0;

  const magnitude = Math.abs(delta).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // U+2212 MINUS SIGN, not a hyphen — it aligns with digits in tabular figures.
  const text = `${delta > 0 ? "+" : "−"}${magnitude}${suffix}`;
  const description = `${improvement ? "Improved" : "Worsened"} by ${magnitude}${suffix}${
    lowerIsBetter ? " (lower is better)" : ""
  }`;

  return { direction, improvement, text, description };
}

/**
 * `null` unless BOTH sides are real numbers. Used for score deltas, where a
 * missing baseline must never be treated as 0 (that would report a brand-new
 * measurement as a giant improvement).
 */
export function safeDelta(before: number | null | undefined, after: number | null | undefined): number | null {
  if (before === null || before === undefined || !Number.isFinite(before)) return null;
  if (after === null || after === undefined || !Number.isFinite(after)) return null;
  return after - before;
}

// ─── Misc ──────────────────────────────────────────────────────────────────

/** "Updated: Sat, Aug 23, 2026" — the small provenance line every widget carries. */
export function formatUpdatedAt(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return null;
  return value.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** Trims a URL to its path for compact table cells, keeping the full value for the title attribute. */
export function shortenUrl(url: string, maxLength = 48): string {
  let display = url;
  try {
    const parsed = new URL(url);
    display = `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    display = url;
  }
  if (display.length <= maxLength) return display;
  return `${display.slice(0, maxLength - 1)}…`;
}

/**
 * Folds a ranked list down to `keep` named entries plus an aggregated
 * "Other" row, so a categorical chart never needs a 9th colour. Returns the
 * tail row only when something was actually folded — never an "Other: 0".
 */
export function foldTail<T extends { label: string; value: number }>(
  rows: T[],
  keep: number,
  otherLabel = "Other"
): { label: string; value: number; isOther: boolean }[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  if (sorted.length <= keep) {
    return sorted.map((row) => ({ label: row.label, value: row.value, isOther: false }));
  }

  const head = sorted.slice(0, keep).map((row) => ({ label: row.label, value: row.value, isOther: false }));
  const tailTotal = sorted.slice(keep).reduce((sum, row) => sum + row.value, 0);
  if (tailTotal <= 0) return head;
  return [...head, { label: otherLabel, value: tailTotal, isOther: true }];
}
