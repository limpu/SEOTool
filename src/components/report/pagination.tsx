import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { paginationRange } from "./filtering";

/**
 * URL-param-driven pagination. MODULE-AGNOSTIC.
 *
 * Every control is a real `<Link>`, so a page is shareable, the back button
 * steps through pages, and paging works with no client JavaScript. The caller
 * owns URL construction via `buildHref`, which lets each report keep its own
 * filter params intact without this component knowing what they are.
 *
 * Renders nothing at all for a single page: a "Page 1 of 1" control is chrome
 * that says nothing. The row-count summary lives here too, because "Showing
 * 26–50 of 137" is the sentence that makes the numbered buttons meaningful.
 */
export function Pagination({
  page,
  totalPages,
  total,
  firstItemIndex,
  lastItemIndex,
  buildHref,
  itemNoun = "results",
  label = "Pagination",
}: {
  page: number;
  totalPages: number;
  total: number;
  firstItemIndex: number;
  lastItemIndex: number;
  buildHref: (page: number) => string;
  itemNoun?: string;
  label?: string;
}) {
  if (totalPages <= 1) return null;

  const slots = paginationRange(page, totalPages);

  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <p className="tabular text-xs text-secondary-foreground">
        Showing {firstItemIndex.toLocaleString("en-US")}–{lastItemIndex.toLocaleString("en-US")} of{" "}
        {total.toLocaleString("en-US")} {itemNoun}
      </p>

      <ul className="flex flex-wrap items-center gap-1">
        <li>
          <PageLink href={buildHref(page - 1)} disabled={page <= 1} ariaLabel="Previous page">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </PageLink>
        </li>

        {slots.map((slot, index) =>
          slot === "ellipsis" ? (
            <li key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-xs text-muted">
              …
            </li>
          ) : (
            <li key={slot}>
              <PageLink
                href={buildHref(slot)}
                current={slot === page}
                ariaLabel={slot === page ? `Page ${slot}, current page` : `Go to page ${slot}`}
              >
                <span className="tabular">{slot.toLocaleString("en-US")}</span>
              </PageLink>
            </li>
          )
        )}

        <li>
          <PageLink href={buildHref(page + 1)} disabled={page >= totalPages} ariaLabel="Next page">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </PageLink>
        </li>
      </ul>
    </nav>
  );
}

/**
 * A disabled step renders as a non-interactive `<span>`, not as a link with a
 * dead href: a keyboard user should not be able to focus a control that cannot
 * do anything, and "next" on the last page has nowhere honest to point.
 */
function PageLink({
  href,
  children,
  current = false,
  disabled = false,
  ariaLabel,
}: {
  href: string;
  children: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const base =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  if (disabled) {
    return (
      <span aria-hidden="true" className={`${base} cursor-not-allowed border-default bg-surface text-muted`}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={current ? "page" : undefined}
      className={`${base} ${
        current
          ? "border-accent bg-accent-subtle font-semibold text-accent"
          : "border-default bg-surface text-secondary-foreground hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
