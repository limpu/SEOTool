"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTooltipCard } from "./chart-tooltip";
import { CATEGORICAL, INK } from "./palette";

export interface PositionTrendPoint {
  /** Display label for the x axis — an ISO date in this product. */
  label: string;
  position: number;
  source: "manual" | "gsc";
}

/**
 * Rank-over-time line for ONE keyword. Thin `"use client"` leaf; the page
 * that renders it stays a Server Component.
 *
 * ─── Why the y axis is reversed ──────────────────────────────────────────
 *
 * Search position is an inverted scale: position 1 is the best result. Drawn
 * on a normal axis, an improving keyword's line would slope DOWNWARD, which
 * every reader instinctively reads as "getting worse" — the chart would state
 * the opposite of the truth. `<YAxis reversed />` puts position 1 at the top,
 * so a line that climbs is a ranking that improved. The axis is also labelled
 * "Position (1 = best)" so the convention is never left to be inferred.
 *
 * ─── What it refuses to draw ─────────────────────────────────────────────
 *
 * Fewer than two measured points renders NOTHING (the caller shows an honest
 * "not enough history yet"). One observation is not a trend, and a flat line
 * through it would claim a stability nobody measured. Observations with no
 * position ("not found in the results I checked") are excluded by the caller
 * rather than plotted at zero — position 0 does not exist.
 */
export function PositionTrendChart({
  points,
  height = 200,
  ariaLabel,
}: {
  points: PositionTrendPoint[];
  height?: number;
  ariaLabel?: string;
}) {
  if (points.length < 2) return null;

  const positions = points.map((point) => point.position);
  const min = Math.min(...positions);
  const max = Math.max(...positions);
  // A little headroom so the line never sits on the axis, but never below 1 —
  // there is no position 0 to pad into.
  const domainLow = Math.max(1, Math.floor(min - Math.max(1, (max - min) * 0.2)));
  const domainHigh = Math.ceil(max + Math.max(1, (max - min) * 0.2));

  return (
    <div style={{ height }} role="img" aria-label={ariaLabel ?? "Search position over time, lower is better"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} strokeWidth={1} />
          <XAxis
            dataKey="label"
            tick={{ fill: INK.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: INK.axis }}
          />
          <YAxis
            reversed
            domain={[domainLow, domainHigh]}
            allowDecimals={false}
            width={46}
            tick={{ fill: INK.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ stroke: INK.axis }}
            content={(props) => {
              const entry = props.payload?.[0];
              if (!props.active || !entry) return null;
              const datum = entry.payload as PositionTrendPoint;
              return (
                <ChartTooltipCard
                  title={datum.label}
                  rows={[
                    {
                      label: "Position (1 = best)",
                      value: String(datum.position),
                      color: CATEGORICAL[0],
                    },
                    {
                      label: "Source",
                      value: datum.source === "gsc" ? "Google Search Console" : "Manual entry",
                      color: datum.source === "gsc" ? CATEGORICAL[2] : CATEGORICAL[1],
                    },
                  ]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="position"
            stroke={CATEGORICAL[0]}
            strokeWidth={2}
            dot={{ r: 3, fill: CATEGORICAL[0] }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
