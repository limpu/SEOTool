import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { GaugeChart } from "@/components/charts/gauge-chart";
import { Sparkline, type SparklinePoint } from "@/components/charts/sparkline";
import { StatTile } from "@/components/charts/stat-tile";
import { scoreBand, scoreBandLabel, type DeltaOptions, type MetricDisplay } from "@/components/charts/format";

/**
 * Thin, module-agnostic wrappers over the chart primitives that already exist
 * in `src/components/charts/`. Nothing here re-implements a chart — the point
 * of this file is the small amount of REPORT-specific chrome (an optional
 * drill-down link on a KPI, a band label under a gauge, an honest "not enough
 * history" state for a trend) that would otherwise be copy-pasted into all 13
 * module reports.
 */

/**
 * A KPI tile that can be a link into the data behind it.
 *
 * Wraps the existing `StatTile`, which already owns the
 * measured-zero-vs-not-measured rule via `MetricDisplay`: a genuine `0`
 * renders full-size in primary ink, a missing value renders smaller and muted
 * with its own wording. This adds only the affordance.
 */
export function MetricCard({
  label,
  value,
  hint,
  delta,
  deltaOptions,
  trend,
  footer,
  href,
}: {
  label: string;
  value: MetricDisplay;
  hint?: string;
  delta?: number | null;
  deltaOptions?: DeltaOptions;
  trend?: ReactNode;
  footer?: ReactNode;
  /** When set, the whole tile becomes a link into the underlying list. */
  href?: string;
}) {
  const tile = (
    <StatTile
      label={label}
      value={value}
      hint={hint}
      delta={delta}
      deltaOptions={deltaOptions}
      trend={trend}
      footer={footer}
    />
  );

  if (!href) return tile;

  return (
    <Link
      href={href}
      className="block rounded-lg transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {tile}
    </Link>
  );
}

/**
 * Score gauge with its band stated in words underneath.
 *
 * Wraps the existing recharts `GaugeChart`, which already refuses to draw a 0%
 * arc for a `null` score. The `Badge` beneath restates the band as icon + text
 * so the verdict never rests on the arc's colour alone.
 */
export function HealthGauge({
  score,
  label,
  caption,
  size = 168,
}: {
  score: number | null;
  label: string;
  caption?: string;
  size?: number;
}) {
  const band = scoreBand(score);
  const variant = band === "unmeasured" ? "unknown" : band === "critical" ? "critical" : band === "serious" ? "serious" : band === "warning" ? "warning" : "good";

  return (
    <div className="flex flex-col items-center">
      <GaugeChart score={score} size={size} caption={caption} />
      <div className="mt-2 flex flex-col items-center gap-1.5">
        <Badge variant={variant}>{scoreBandLabel(band)}</Badge>
        <span className="text-xs text-secondary-foreground">{label}</span>
      </div>
    </div>
  );
}

/**
 * A measured trend line, or an honest statement that there is not yet enough
 * history to draw one.
 *
 * The existing `Sparkline` returns `null` below two points, which is correct
 * for it — but a silently missing chart leaves a hole the user cannot
 * interpret. This says the actual reason out loud instead. Crucially it does
 * NOT pad, interpolate or flat-line: one measurement is not a trend, and
 * drawing it as one would claim a stability nobody observed.
 */
export function TrendChart({
  points,
  emptyLabel = "Not enough history yet",
  emptyHint,
  valueLabel = "Score",
  ariaLabel,
  width,
  height,
}: {
  points: SparklinePoint[];
  emptyLabel?: string;
  emptyHint?: string;
  valueLabel?: string;
  ariaLabel?: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div className="text-right">
        <p className="text-xs font-medium text-muted">{emptyLabel}</p>
        {emptyHint && <p className="text-[11px] text-muted">{emptyHint}</p>}
      </div>
    );
  }

  return (
    <Sparkline points={points} width={width} height={height} valueLabel={valueLabel} ariaLabel={ariaLabel} />
  );
}
