import type { BadgeVariant } from "@/components/ui/badge";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

/**
 * Severity → `Badge` variant, matching the Overview dashboard's
 * `SEVERITY_COLOR` map exactly (critical/serious/warning/good/neutral), so a
 * "high" finding is the same colour on the dashboard donut as it is on the
 * module report that opens from it.
 *
 * `info` gets the neutral chrome variant on purpose: an informational finding
 * is not a verdict, so it never borrows a status hue. Every status variant
 * ships an icon and a text label, so the severity survives greyscale.
 */
export const SEVERITY_VARIANT: Record<Severity, BadgeVariant> = {
  critical: "critical",
  high: "serious",
  medium: "warning",
  low: "good",
  info: "neutral",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};
