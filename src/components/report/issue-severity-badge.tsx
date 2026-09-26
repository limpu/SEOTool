import { Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SEVERITY_LABELS, SEVERITY_VARIANT } from "@/components/website/severity";
import type { Severity } from "@/lib/scoring/formula";

/**
 * The one severity badge for every report module.
 *
 * It wraps the existing `Badge` and the existing `SEVERITY_VARIANT` /
 * `SEVERITY_LABELS` maps rather than defining a parallel severity vocabulary —
 * a "high" finding must look identical on the Overview dashboard, on the
 * Site Audit issue list, and on the Technical SEO report.
 *
 * Colour is NEVER the sole carrier. `Badge` already ships a lucide icon with
 * each status variant; `info` maps to the neutral chrome variant (an
 * informational finding is not a verdict and must not borrow a status hue),
 * which carries no icon of its own, so an explicit `Info` glyph is supplied
 * here. The result: all five severities render icon + text, and all five
 * survive greyscale.
 */
export function IssueSeverityBadge({
  severity,
  count,
  className = "",
}: {
  severity: Severity;
  /** Optional trailing count, e.g. "Critical 9". A real 0 is shown; `undefined` shows nothing. */
  count?: number;
  className?: string;
}) {
  const label = SEVERITY_LABELS[severity];

  return (
    <Badge variant={SEVERITY_VARIANT[severity]} className={className}>
      {severity === "info" && <Info className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />}
      {label}
      {count !== undefined && <span className="tabular">{count.toLocaleString("en-US")}</span>}
    </Badge>
  );
}

/**
 * The coloured rule that sits under a severity section header.
 *
 * `info` deliberately gets the neutral border token rather than a status hue,
 * matching the badge above it. The rule is decorative reinforcement only — the
 * section header text and its badge already state the severity in words.
 */
export const SEVERITY_RULE_CLASS: Record<Severity, string> = {
  critical: "bg-status-critical",
  high: "bg-status-serious",
  medium: "bg-status-warning",
  low: "bg-status-good",
  info: "bg-strong",
};
