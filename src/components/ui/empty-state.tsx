import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The one honest "we have nothing to show you yet" block.
 *
 * This project's Section 79 rule is that a missing prerequisite must produce
 * "No data yet" / "Not assessed" / "Connect X" — never a substituted 0 and
 * never an invented number. Those states were previously written ad hoc all
 * over the app and all looked different; this makes them one recognisable
 * thing, so a user learns to read "nothing here yet" at a glance instead of
 * wondering whether a zero is a measurement.
 *
 * Everything wears neutral chrome ink deliberately. An empty state is NOT a
 * failure verdict, so it never borrows a status colour.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  children,
  className = "",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Optional CTA — rendered as a link, e.g. "Connect Search Console". */
  actionLabel?: string;
  actionHref?: string;
  /** Escape hatch for a client-side action button instead of a link. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-8 text-center ${className}`}>
      {Icon && (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle">
          <Icon className="h-5 w-5 text-muted" aria-hidden="true" />
        </span>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-secondary-foreground">{description}</p>}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-3 rounded-md text-xs font-semibold text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {actionLabel} →
        </Link>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
