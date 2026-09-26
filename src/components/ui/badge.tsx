import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export type BadgeVariant = "neutral" | "accent" | "good" | "warning" | "serious" | "critical" | "unknown";

/**
 * Status variants ALWAYS render an icon beside the label. This is the house
 * rule that colour is never the sole carrier of meaning — several of the
 * status hues sit below 3:1 on a white surface by design, and the icon plus
 * the text label is what makes the badge survive greyscale printing and
 * colour-vision differences.
 *
 * `neutral` and `accent` are chrome, not verdicts, so they carry no icon.
 * `unknown` exists so "we did not measure this" can be shown without
 * borrowing a pass/fail colour it has not earned.
 */
const VARIANTS: Record<BadgeVariant, { box: string; Icon: LucideIcon | null }> = {
  neutral: { box: "bg-surface-subtle text-secondary-foreground border-default", Icon: null },
  accent: { box: "bg-accent-subtle text-accent border-accent/30", Icon: null },
  good: { box: "bg-status-good-subtle text-foreground border-status-good/30", Icon: CheckCircle2 },
  warning: { box: "bg-status-warning-subtle text-foreground border-status-warning/40", Icon: TriangleAlert },
  serious: { box: "bg-status-serious-subtle text-foreground border-status-serious/40", Icon: AlertTriangle },
  critical: { box: "bg-status-critical-subtle text-foreground border-status-critical/30", Icon: OctagonAlert },
  unknown: { box: "bg-surface-subtle text-muted border-default", Icon: CircleHelp },
};

/** Icon ink for the status variants — the one place the status hue itself appears. */
const ICON_INK: Record<BadgeVariant, string> = {
  neutral: "",
  accent: "",
  good: "text-status-good",
  warning: "text-status-warning",
  serious: "text-status-serious",
  critical: "text-status-critical",
  unknown: "text-muted",
};

export function Badge({
  variant = "neutral",
  children,
  title,
  className = "",
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  const { box, Icon } = VARIANTS[variant];

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${box} ${className}`}
    >
      {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${ICON_INK[variant]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}
