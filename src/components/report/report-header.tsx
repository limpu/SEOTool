import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";

/**
 * The header every module report shares: what this report is, which site it
 * is about, a metadata line saying when and over what it was measured, and a
 * right-aligned action slot.
 *
 * MODULE-AGNOSTIC — nothing here knows about Site Audit. The 12 other modules
 * pass their own title, chips and actions.
 *
 * The metadata line is a `<dl>`, not a row of divs, because each chip really
 * is a term/value pair ("Pages crawled: 48"). That gives assistive technology
 * the pairing for free and keeps the label visible for everyone, instead of
 * relying on a bare number's position to convey what it counts.
 */
export interface ReportChip {
  label: string;
  /**
   * Pre-formatted display value. Pass an honest string ("No data",
   * "Never crawled") for a missing measurement — never a substituted 0.
   */
  value: string;
  /**
   * Set only when the value is a genuine verdict (crawl failed, crawl
   * running). Chrome metadata stays unstyled: a chip that borrows a status
   * hue for a neutral fact makes the real verdicts harder to spot.
   */
  tone?: BadgeVariant;
  title?: string;
}

export function ReportHeader({
  title,
  siteName,
  siteUrl,
  chips = [],
  actions,
}: {
  title: string;
  /** The site this report is about — shown beside the report's own name. */
  siteName?: string;
  /** Rendered as an external link when present. */
  siteUrl?: string;
  chips?: ReportChip[];
  /** Right-aligned action slot — "Run crawl", "Export", etc. */
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold text-foreground">{title}</h1>

        {(siteName || siteUrl) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-secondary-foreground">
            {siteName && <span className="font-medium">{siteName}</span>}
            {siteUrl && (
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-sm hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {siteUrl}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </a>
            )}
          </p>
        )}

        {chips.length > 0 && (
          <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {chips.map((chip) => (
              <div key={chip.label} className="flex items-center gap-1.5" title={chip.title}>
                <dt className="text-xs text-muted">{chip.label}</dt>
                <dd className="text-xs font-semibold text-foreground">
                  {chip.tone ? <Badge variant={chip.tone}>{chip.value}</Badge> : chip.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * A header action styled as the report's primary button, expressed as a link.
 * Buttons that navigate should be links — they must open in a new tab, be
 * copyable, and work before hydration.
 */
export function ReportHeaderAction({
  href,
  children,
  variant = "secondary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const classes =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary-hover"
      : "border border-strong bg-surface text-foreground hover:bg-surface-hover";

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${classes}`}
    >
      {children}
    </Link>
  );
}
