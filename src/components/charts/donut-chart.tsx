"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltipCard } from "./chart-tooltip";
import { SURFACE } from "./palette";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  /** Assigned by the caller from the fixed categorical order — colour follows the entity, never its rank. */
  color: string;
}

/**
 * Composition donut with a centred total. The legend is deliberately NOT
 * recharts' `<Legend>`: the caller renders its own HTML list beside this so
 * each row can be a real link into that module's report and can carry its
 * own count. A legend is always present for ≥2 series.
 *
 * Zero-valued slices are filtered out of the ring (they have no arc) but the
 * caller still lists them in the legend — a measured zero is a real, good
 * result and must stay visible, just not as an invisible wedge.
 */
export function DonutChart({
  slices,
  total,
  totalLabel,
  size = 176,
  emptyMessage = "No issues found",
}: {
  slices: DonutSlice[];
  total: number;
  totalLabel: string;
  size?: number;
  emptyMessage?: string;
}) {
  const drawable = slices.filter((slice) => slice.value > 0);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {drawable.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center rounded-full border-8 border-grid">
          <span className="px-4 text-center text-xs font-medium text-secondary-foreground">{emptyMessage}</span>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={drawable}
                dataKey="value"
                nameKey="label"
                innerRadius="64%"
                outerRadius="94%"
                paddingAngle={drawable.length > 1 ? 2 : 0}
                stroke={SURFACE}
                strokeWidth={2}
                isAnimationActive={false}
              >
                {drawable.map((slice) => (
                  <Cell key={slice.key} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip
                content={(props) => {
                  const entry = props.payload?.[0];
                  if (!props.active || !entry) return null;
                  const datum = entry.payload as DonutSlice;
                  const share = total > 0 ? Math.round((datum.value / total) * 100) : 0;
                  return (
                    <ChartTooltipCard
                      title={datum.label}
                      rows={[
                        { label: "Issues", value: datum.value.toLocaleString("en-US"), color: datum.color },
                        { label: "Share", value: `${share}%` },
                      ]}
                    />
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl leading-none font-bold text-foreground">{total.toLocaleString("en-US")}</span>
            <span className="mt-1 max-w-[70%] text-center text-[11px] leading-tight text-muted">{totalLabel}</span>
          </div>
        </>
      )}
    </div>
  );
}
