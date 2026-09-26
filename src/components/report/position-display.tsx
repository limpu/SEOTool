import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { HorizontalBarChart } from "@/components/charts/horizontal-bar-chart";
import { SEQUENTIAL } from "@/components/charts/palette";
import { POSITION_HINT, type PositionDistributionRow, type PositionMovement } from "./position";

/**
 * Stage 3B — the shared *rendering* of an inverted-scale search position.
 *
 * The arithmetic lives in `position.ts` (pure, unit-tested). This file only
 * decides how it looks, and enforces the two presentation rules that make an
 * inverted metric readable:
 *
 *  1. The ARROW follows the ranking, not the raw number. Position 15 → 8 shows
 *     an UP arrow, because the listing moved up the page — even though the
 *     number went down. `DeltaChip` deliberately does the opposite (its arrow
 *     tracks the raw number), which is right for clicks and impressions and
 *     confusing for a rank, so rank movement gets its own chip here.
 *  2. Colour is never the only carrier. Every chip pairs its hue with an icon
 *     AND the movement spelled out in words ("Up 7 places"), plus a full
 *     sentence for assistive technology.
 */

export function PositionValue({
  position,
  unavailable = "Not ranked",
  decimals = 1,
}: {
  position: number | null | undefined;
  /** Copy for a genuinely absent position. Never rendered as 0. */
  unavailable?: string;
  decimals?: number;
}) {
  if (position === null || position === undefined || !Number.isFinite(position)) {
    return <span className="text-sm font-medium text-muted">{unavailable}</span>;
  }
  const text = Number.isInteger(position) ? String(position) : position.toFixed(decimals);
  return <span className="tabular font-semibold text-foreground">{text}</span>;
}

/**
 * Movement chip for a rank change. Renders nothing when there is no honest
 * movement to state — the caller shows "Not enough history yet" instead.
 */
export function PositionMovementChip({ movement }: { movement: PositionMovement | null }) {
  if (!movement) return null;

  if (movement.direction === "unchanged") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted" title={movement.description}>
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        {movement.label}
        <span className="sr-only">{movement.description}</span>
      </span>
    );
  }

  const Icon = movement.movedUp ? ArrowUp : ArrowDown;

  return (
    <span
      className={`tabular inline-flex items-center gap-1 text-xs font-semibold ${
        movement.improvement ? "text-delta-up" : "text-delta-down"
      }`}
      title={movement.description}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {movement.label}
      <span className="sr-only">{movement.description}</span>
    </span>
  );
}

/** The standing clarifier that must sit beside any position figure. */
export function PositionScaleNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-muted ${className}`}>
      Search position is an inverted scale — <strong className="font-semibold text-secondary-foreground">{POSITION_HINT}</strong>. Moving
      from position 15 to position 8 is an improvement; moving from 8 to 15 is a decline.
    </p>
  );
}

/**
 * Provenance badge for a position reading. Chrome, not a verdict: a
 * Google-sourced number is not "good" and a self-reported one is not "bad" —
 * they are different kinds of evidence, and the label says which.
 */
export function PositionSourceBadge({ source }: { source: "manual" | "gsc" }) {
  return (
    <Badge variant={source === "gsc" ? "accent" : "neutral"}>
      {source === "gsc" ? "Google Search Console" : "Manual entry"}
    </Badge>
  );
}

/**
 * Ranked distribution of positions across a set of keywords or queries.
 *
 * This IS chart-shaped — six ordered magnitudes that a reader compares
 * visually — so it earns a bar chart, unlike the single counts elsewhere in
 * the report that a tile says better. The sequential ramp is used
 * best-to-worst as a magnitude ordering, not as a status colour: a keyword in
 * position 30 is not a "warning", so no status hue is borrowed. Every bar is
 * also written out as a labelled row underneath, so the reading never depends
 * on the chart rendering or on colour at all.
 */
export function PositionDistribution({
  rows,
  total,
  noun = "keywords",
}: {
  rows: PositionDistributionRow[];
  total: number;
  noun?: string;
}) {
  if (total === 0) return null;

  const data = rows.map((row, index) => ({
    label: row.label,
    value: row.count,
    color: SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, 2 + index)],
    display: `${row.count.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`,
  }));

  return (
    <div className="space-y-3">
      <HorizontalBarChart data={data} valueLabel={noun} labelWidth={124} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-2 border-b border-default pb-1">
            <dt className="text-xs text-secondary-foreground" title={row.hint}>
              {row.label}
            </dt>
            {/* A measured 0 renders as a real 0 here — it is a finding, not an absence. */}
            <dd className="tabular text-sm font-semibold text-foreground">{row.count.toLocaleString("en-US")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
