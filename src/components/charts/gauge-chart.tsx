"use client";

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { INK, STATUS } from "./palette";
import { scoreBand, scoreBandLabel, type ScoreBand } from "./format";

const BAND_COLOR: Record<ScoreBand, string> = {
  good: STATUS.good,
  warning: STATUS.warning,
  serious: STATUS.serious,
  critical: STATUS.critical,
  // "Not measured" is not a verdict — it must never borrow a status colour.
  unmeasured: INK.grid,
};

/**
 * Semicircular score gauge (recharts `RadialBarChart`, 180° → 0°).
 *
 * The `PolarAngleAxis` with an explicit numeric `domain` is what makes the
 * sweep proportional to the 0-100 score rather than to the (single) data
 * row's share of the chart.
 *
 * Honesty: a `null` score renders an empty track plus the words "Not
 * measured" — never a 0% arc, which would read as a real, terrible score.
 * The band colour is always accompanied by its text label (and, at the call
 * site, an icon), so colour is never the only carrier of the verdict.
 */
export function GaugeChart({
  score,
  size = 168,
  caption,
}: {
  score: number | null;
  size?: number;
  caption?: string;
}) {
  const band = scoreBand(score);
  const color = BAND_COLOR[band];
  const value = score ?? 0;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size * 0.62 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={[{ name: "score", value }]}
          startAngle={180}
          endAngle={0}
          innerRadius="74%"
          outerRadius="100%"
          cy="96%"
          barSize={14}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            dataKey="value"
            angleAxisId={0}
            background={{ fill: INK.grid }}
            cornerRadius={7}
            fill={color}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
        {score === null ? (
          <span className="text-sm font-medium text-muted">Not measured</span>
        ) : (
          <>
            <span className="text-4xl leading-none font-bold text-foreground">{score}</span>
            <span className="mt-1 text-xs font-medium text-secondary-foreground">
              {caption ?? scoreBandLabel(band)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
