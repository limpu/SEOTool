import { CheckCircle2, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { ReactNode } from "react";

type AlertVariant = "error" | "success" | "info" | "warning";

/**
 * Variants map onto the RESERVED status roles (`info` onto the accent, which
 * is the app's neutral "interactive/informational" hue rather than a verdict).
 *
 * Two deliberate choices here:
 *
 *  1. Every variant ships an ICON as well as a tint, because the house rule is
 *     that a status colour never travels alone — the meaning has to survive
 *     greyscale and colour-vision differences.
 *  2. The message text wears `--foreground`, NOT the status hue. Several of
 *     the status colours (`--status-warning` especially) sit below 3:1 on
 *     their own subtle tint by design; the icon and border carry the colour,
 *     the ink stays readable.
 */
const styles: Record<AlertVariant, { box: string; icon: string; Icon: typeof Info; label: string }> = {
  error: {
    box: "bg-status-critical-subtle border-status-critical/30",
    icon: "text-status-critical",
    Icon: OctagonAlert,
    label: "Error",
  },
  success: {
    box: "bg-status-good-subtle border-status-good/30",
    icon: "text-status-good",
    Icon: CheckCircle2,
    label: "Success",
  },
  info: {
    box: "bg-accent-subtle border-accent/30",
    icon: "text-accent",
    Icon: Info,
    label: "Information",
  },
  warning: {
    box: "bg-status-warning-subtle border-status-warning/40",
    icon: "text-status-warning",
    Icon: TriangleAlert,
    label: "Warning",
  },
};

export function Alert({
  variant = "info",
  children,
}: {
  variant?: AlertVariant;
  children: ReactNode;
}) {
  const { box, icon, Icon, label } = styles[variant];

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-md border px-4 py-3 text-sm text-foreground ${box}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} aria-hidden="true" />
      <span className="sr-only">{label}: </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
