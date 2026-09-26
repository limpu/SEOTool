/**
 * Data-visualization palette — the project's charting standard.
 *
 * The literal hex values live in exactly ONE place, `src/app/globals.css`
 * (`:root`), and are referenced from here as `var(--…)` strings so an SVG
 * `fill`/`stroke` attribute and a Tailwind utility (`text-secondary-foreground`,
 * `stroke-grid`, …) always resolve to the same colour. Never hard-code a
 * chart hex in a component — import the role from this module.
 *
 * Rules this palette exists to enforce (see read.md's 2026-08-23 charting
 * standard write-up):
 *
 *  - CATEGORICAL is assigned in fixed index order and NEVER cycled. Colour
 *    follows the entity, never its rank — filtering a series out must not
 *    repaint the survivors, so callers map a stable entity key to a fixed
 *    index rather than using the array position of a filtered list. There is
 *    deliberately no 9th colour: past ~7-8 meaningful categories the honest
 *    answer is a table, not more hues.
 *  - SEQUENTIAL is a single hue light → dark, for magnitude/heat only.
 *    Never a rainbow, never used for unordered categories.
 *  - STATUS is RESERVED. It never doubles as a series colour, and every
 *    status mark must ship with an icon + text label so colour is never the
 *    sole carrier of meaning (colour-blind and greyscale safety).
 *  - INK is what text wears. Values, labels and legends stay in ink tokens;
 *    a coloured swatch beside them carries the series identity.
 */

/** Fixed-order categorical ramp. Index by a stable entity key, never by filtered rank. */
export const CATEGORICAL = [
  "var(--chart-cat-1)", // 1 blue
  "var(--chart-cat-2)", // 2 orange
  "var(--chart-cat-3)", // 3 aqua
  "var(--chart-cat-4)", // 4 yellow
  "var(--chart-cat-5)", // 5 magenta
  "var(--chart-cat-6)", // 6 green
  "var(--chart-cat-7)", // 7 violet
  "var(--chart-cat-8)", // 8 red
] as const;

/** Single-hue light → dark ramp, for magnitude only. */
export const SEQUENTIAL = [
  "var(--chart-seq-1)",
  "var(--chart-seq-2)",
  "var(--chart-seq-3)",
  "var(--chart-seq-4)",
  "var(--chart-seq-5)",
  "var(--chart-seq-6)",
  "var(--chart-seq-7)",
  "var(--chart-seq-8)",
  "var(--chart-seq-9)",
  "var(--chart-seq-10)",
  "var(--chart-seq-11)",
  "var(--chart-seq-12)",
  "var(--chart-seq-13)",
] as const;

export type StatusKey = "good" | "warning" | "serious" | "critical";

/** Reserved status ramp — always paired with an icon + text label. */
export const STATUS: Record<StatusKey, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
};

/** Chrome/ink tokens. Text and axes only — never a series colour. */
export const INK = {
  primary: "var(--foreground)",
  secondary: "var(--foreground-secondary)",
  muted: "var(--foreground-muted)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  deltaUpGood: "var(--delta-up)",
} as const;

/** The card surface charts sit on — used to cut the gap between stacked segments. */
export const SURFACE = "var(--chart-surface)";

/**
 * The colour for an "everything else"/unmeasured slice. Deliberately the
 * muted ink, not a categorical colour: a residual bucket is not an entity,
 * and giving it a hue would imply it belongs to the same set as the named
 * series.
 */
export const NEUTRAL_MARK = INK.grid;

/** Never cycles: an index past the ramp returns the neutral mark instead of wrapping to colour 1. */
export function categoricalAt(index: number): string {
  return CATEGORICAL[index] ?? NEUTRAL_MARK;
}

/**
 * Maps a 0-1 magnitude onto the sequential ramp. Used only where a value
 * genuinely encodes magnitude (never for unordered categories).
 */
export function sequentialFor(fraction: number): string {
  if (!Number.isFinite(fraction)) return SEQUENTIAL[0];
  const clamped = Math.max(0, Math.min(1, fraction));
  const index = Math.round(clamped * (SEQUENTIAL.length - 1));
  return SEQUENTIAL[index];
}
