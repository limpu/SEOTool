import { TrendingDown, TrendingUp } from "lucide-react";
import { describeDelta, type DeltaOptions } from "./format";

/**
 * The "+89"-style change chip beside a headline number.
 *
 * Renders NOTHING when there is no honest delta to show — no comparable
 * baseline (fewer than two measurements) and an exactly-unchanged value both
 * produce `null` rather than a fabricated "0%" with a flat arrow.
 *
 * Colour is never the sole carrier: every chip pairs its delta colour with a
 * direction arrow icon and a signed number, and its `title` spells the
 * verdict out in words — which is what makes the inverted-scale case
 * (Search Console Average Position, where a FALLING number is an
 * improvement) readable instead of merely green.
 *
 * Note the colour is chosen by `improvement`, NOT by `direction`: the arrow
 * shows which way the raw number moved, the colour shows whether that was
 * good. On an inverted metric those disagree, and that is exactly correct.
 *
 * This is deliberately plain markup, not a recharts component: a two-glyph
 * chip needs no chart runtime, and keeping it a Server Component keeps it out
 * of the client bundle entirely.
 */
export function DeltaChip({
  delta,
  lowerIsBetter = false,
  decimals = 0,
  suffix = "",
  className = "",
}: {
  delta: number | null | undefined;
} & DeltaOptions & { className?: string }) {
  const described = describeDelta(delta, { lowerIsBetter, decimals, suffix });
  if (!described) return null;

  const Icon = described.direction === "up" ? TrendingUp : TrendingDown;

  return (
    <span
      className={`tabular inline-flex items-center gap-1 text-xs font-semibold ${
        described.improvement ? "text-delta-up" : "text-delta-down"
      } ${className}`}
      title={described.description}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {described.text}
      <span className="sr-only">{described.description}</span>
    </span>
  );
}
