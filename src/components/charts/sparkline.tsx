"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "./chart-tooltip";
import { CATEGORICAL } from "./palette";

export interface SparklinePoint {
  label: string;
  value: number;
}

/**
 * Tiny trend line beside a headline metric — no axes, no grid, no per-point
 * labels; the accompanying big number and delta chip carry the reading, this
 * only shows the shape.
 *
 * Renders `null` for fewer than two real points. A one-point "trend" is not a
 * trend, and drawing a flat line for it would imply a stability we never
 * measured.
 */
export function Sparkline({
  points,
  color = CATEGORICAL[0],
  width = 108,
  height = 36,
  valueLabel = "Score",
  ariaLabel,
}: {
  points: SparklinePoint[];
  color?: string;
  width?: number;
  height?: number;
  valueLabel?: string;
  ariaLabel?: string;
}) {
  if (points.length < 2) return null;

  return (
    <div style={{ width, height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={false}
            content={(props) => {
              const entry = props.payload?.[0];
              if (!props.active || !entry) return null;
              const datum = entry.payload as SparklinePoint;
              return (
                <ChartTooltipCard
                  title={datum.label}
                  rows={[{ label: valueLabel, value: datum.value.toLocaleString("en-US"), color }]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
