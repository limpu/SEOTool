"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "./chart-tooltip";
import { INK } from "./palette";

export interface HorizontalBarDatum {
  label: string;
  value: number;
  color: string;
  /** Optional pre-formatted value for the tooltip (e.g. "43.1%"). Falls back to a grouped integer. */
  display?: string;
}

/**
 * Ranked horizontal bar chart (recharts `BarChart`, `layout="vertical"`).
 *
 * Category labels live on the y-axis in secondary ink; bars are 4px-rounded
 * at the data end only and stay anchored to the x=0 baseline. Grid lines are
 * a hairline in the recessive grid token and only run along the value axis.
 * There is deliberately no label on every bar — the axis plus the hover
 * tooltip carry the numbers.
 */
export function HorizontalBarChart({
  data,
  height,
  labelWidth = 116,
  valueLabel = "Value",
  maxDomain,
}: {
  data: HorizontalBarDatum[];
  height?: number;
  labelWidth?: number;
  valueLabel?: string;
  /** Fixes the value axis (e.g. [0, 100] for scores) so bars are comparable across widgets. */
  maxDomain?: number;
}) {
  if (data.length === 0) return null;
  const resolvedHeight = height ?? Math.max(90, data.length * 30 + 30);

  return (
    <div style={{ height: resolvedHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={INK.grid} strokeWidth={1} />
          <XAxis
            type="number"
            domain={maxDomain ? [0, maxDomain] : undefined}
            tick={{ fill: INK.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: INK.axis }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            tick={{ fill: INK.secondary, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(11,11,11,0.04)" }}
            content={(props) => {
              const entry = props.payload?.[0];
              if (!props.active || !entry) return null;
              const datum = entry.payload as HorizontalBarDatum;
              return (
                <ChartTooltipCard
                  title={datum.label}
                  rows={[
                    {
                      label: valueLabel,
                      value: datum.display ?? datum.value.toLocaleString("en-US"),
                      color: datum.color,
                    },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="value" barSize={14} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((datum) => (
              <Cell key={datum.label} fill={datum.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
