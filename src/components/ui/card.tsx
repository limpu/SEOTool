import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

/**
 * The single most-repeated pattern in this codebase was a hand-written panel
 * div carrying its own rounded corners, hairline border, white background,
 * padding and shadow as raw palette utilities — the same five classes copied
 * dozens of times. That is now this component, expressed entirely in token
 * roles (`--surface`, `--border`), so a change to the card surface happens in
 * one place instead of dozens.
 *
 * Padding lives on `CardHeader`/`CardContent`/`CardFooter` rather than on the
 * `Card` itself, so a full-bleed child (a table, a chart that should touch the
 * card edge) can opt out simply by not being wrapped in one.
 */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className = "", children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={`rounded-lg border border-default bg-surface shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
});

export function CardHeader({
  className = "",
  children,
  action,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  /** Right-aligned slot for a "View full report →" link or a filter control. */
  action?: ReactNode;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 px-5 pt-5 pb-3 ${className}`} {...rest}>
      <div className="min-w-0">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardTitle({ className = "", children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={`text-sm font-semibold text-foreground ${className}`} {...rest}>
      {children}
    </h2>
  );
}

/** The small provenance line ("Updated: …") that sits under a widget title. */
export function CardDescription({ className = "", children, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`mt-0.5 text-xs text-muted ${className}`} {...rest}>
      {children}
    </p>
  );
}

export function CardContent({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-5 pb-5 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`border-t border-default px-5 py-3 ${className}`} {...rest}>
      {children}
    </div>
  );
}
