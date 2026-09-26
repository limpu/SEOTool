"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "./chart-tooltip";
import { SURFACE } from "./palette";

export interface StackedBarSeries {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Single-row horizontal 100% stacked bar (recharts `BarChart` with
 * `layout="vertical"`), used for the issues-by-severity composition.
 *
 * Only non-zero series get a stacked `<Bar>` — a zero-height segment would
 * otherwise still consume the 2px surface stroke and render as a thin sliver
 * of a severity that genuinely has no issues. The first and last *drawn*
 * segments carry the 4px rounded outer ends so the mark stays anchored to the
 * track; interior joins stay square and are separated by a 2px stroke in the
 * card's own surface colour.
 */
export function StackedBarChart({
  series,
  height = 40,
  ariaLabel,
}: {
  series: StackedBarSeries[];
  height?: number;
  ariaLabel?: string;
}) {
  const drawn = series.filter((entry) => entry.value > 0);
  const total = drawn.reduce((sum, entry) => sum + entry.value, 0);

  if (drawn.length === 0 || total === 0) return null;

  const row: Record<string, number | string> = { name: "total" };
  for (const entry of drawn) row[entry.key] = entry.value;

  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={[row]} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap={0}>
          <XAxis type="number" hide domain={[0, total]} />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            cursor={false}
            content={(props) => {
              if (!props.active || !props.payload?.length) return null;
              return (
                <ChartTooltipCard
                  rows={props.payload.map((item) => {
                    const match = drawn.find((entry) => entry.key === item.dataKey);
                    const value = Number(item.value ?? 0);
                    const share = total > 0 ? Math.round((value / total) * 100) : 0;
                    return {
                      label: match?.label ?? String(item.dataKey),
                      value: `${value.toLocaleString("en-US")} · ${share}%`,
                      color: match?.color,
                    };
                  })}
                />
              );
            }}
          />
          {drawn.map((entry, index) => (
            <Bar
              key={entry.key}
              dataKey={entry.key}
              stackId="severity"
              fill={entry.color}
              stroke={SURFACE}
              strokeWidth={2}
              isAnimationActive={false}
              radius={cornerRadius(index, drawn.length)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** [topLeft, topRight, bottomRight, bottomLeft] — round only the outermost ends of the stack. */
function cornerRadius(index: number, count: number): [number, number, number, number] {
  const first = index === 0;
  const last = index === count - 1;
  if (count === 1) return [4, 4, 4, 4];
  if (first) return [4, 0, 0, 4];
  if (last) return [0, 4, 4, 0];
  return [0, 0, 0, 0];
}
