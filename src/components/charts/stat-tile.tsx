import type { ReactNode } from "react";
import { DeltaChip } from "./delta-chip";
import type { MetricDisplay, DeltaOptions } from "./format";

/**
 * Boxed KPI tile: label, big value, optional delta chip, optional sparkline.
 *
 * The value is passed in as a `MetricDisplay` (from `format.ts`) rather than
 * a raw number specifically so this component can honour the
 * unavailable-vs-zero distinction it cannot infer on its own: an unavailable
 * value renders smaller and in muted ink with its own wording ("Not
 * measured" / "No data yet"), while a genuine measured `0` renders as a
 * full-size, primary-ink `0` — a real result.
 *
 * A single value belongs here, never in a one-bar bar chart.
 *
 * Hero numbers deliberately use the default proportional figures; only
 * aligned columns and axis ticks get tabular figures.
 */
export function StatTile({
  label,
  value,
  hint,
  delta,
  deltaOptions,
  trend,
  footer,
}: {
  label: string;
  value: MetricDisplay;
  /** Small clarifier under the label, e.g. "lower is better". */
  hint?: string;
  delta?: number | null;
  deltaOptions?: DeltaOptions;
  trend?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-default p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-secondary-foreground" title={label}>
            {label}
          </div>
          {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
        </div>
        {trend}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {value.available ? (
          <span className="text-2xl leading-none font-bold text-foreground">{value.text}</span>
        ) : (
          <span className="text-sm leading-tight font-medium text-muted">{value.text}</span>
        )}
        {value.available && <DeltaChip delta={delta} {...deltaOptions} />}
      </div>

      {footer && <div className="mt-1.5 text-[11px] text-muted">{footer}</div>}
    </div>
  );
}
