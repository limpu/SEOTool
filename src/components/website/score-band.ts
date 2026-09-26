import type { BadgeVariant } from "@/components/ui/badge";

/**
 * Shared 0-100 score → status-band mapping for the workspace module panels.
 *
 * The 90/50 cut points are the ones these panels have always used and are
 * deliberately NOT the dashboard's `scoreBand` (80/60/40) from
 * `@/components/charts/format` — the two answer different questions, and
 * silently unifying them would change which band a real score reports.
 * Extracted here only so the three panels that had a byte-identical
 * `scoreColor()` helper share one definition instead of three.
 *
 * Returns a `Badge` variant rather than raw classes, so every band ships an
 * icon and a text label and colour is never the sole carrier of the verdict.
 */
export type PanelScoreBand = "good" | "warning" | "critical" | "unknown";

export function panelScoreBand(score: number | null): PanelScoreBand {
  if (score === null) return "unknown";
  if (score >= 90) return "good";
  if (score >= 50) return "warning";
  return "critical";
}

export function panelScoreVariant(score: number | null): BadgeVariant {
  return panelScoreBand(score);
}

/** The text label that must accompany the band colour. */
export function panelScoreLabel(score: number | null): string {
  switch (panelScoreBand(score)) {
    case "good":
      return "Good";
    case "warning":
      return "Needs work";
    case "critical":
      return "Poor";
    case "unknown":
      return "Not measured";
  }
}
