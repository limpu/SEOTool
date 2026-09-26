"use client";

export interface ChartTooltipRow {
  label: string;
  value: string;
  /** Series swatch. Omitted for single-series charts, where the title already names the series. */
  color?: string;
}

/**
 * Shared hover card for every recharts `<Tooltip content={…} />` in the app.
 * Styled to match the surrounding cards (surface token, hairline border,
 * small type) rather than recharts' default black box, and — per the house
 * dataviz rules — the text wears ink tokens while a coloured swatch carries
 * series identity. The swatch is the ONLY place a series colour appears here.
 */
export function ChartTooltipCard({ title, rows }: { title?: string; rows: ChartTooltipRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-default bg-surface px-3 py-2 shadow-md" role="tooltip">
      {title && <div className="mb-1 text-xs font-semibold text-foreground">{title}</div>}
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-xs whitespace-nowrap">
            {row.color && (
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="text-secondary-foreground">{row.label}</span>
            <span className="tabular ml-auto font-semibold text-foreground">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
