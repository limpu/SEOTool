"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { resolveActiveTab, type ReportTab } from "./tabs";

/**
 * The in-report tab bar (Overview | Issues | …).
 *
 * MODULE-AGNOSTIC: it renders whatever `{label, href, count?}[]` it is given.
 *
 * Every tab is a real `<Link>` to a real nested route, NOT client-side tab
 * state. That is the whole point: each tab has its own shareable URL, the
 * browser back button moves between tabs, and a deep link into
 * `…/issues/TECH_MISSING_HSTS` still shows "Issues" as the active section.
 *
 * This is the only part of the report chrome that must be a Client Component,
 * and only because it needs `usePathname()` to know which tab is active. It
 * holds no state and fetches nothing.
 *
 * Accessibility: a `<nav>` landmark wrapping a real list of links. Links are
 * natively keyboard-navigable and focusable in order, so no roving-tabindex
 * keyboard handler is invented here — an ARIA `tablist` would have to
 * re-implement (and could only degrade) behaviour the browser already gives
 * these links for free, and `role="tab"` would be a lie about elements that
 * navigate rather than toggle panels. The active tab carries
 * `aria-current="page"`, and is marked by an underline rule and a weight
 * change as well as colour.
 */
export function ReportTabs({ tabs, className = "" }: { tabs: ReportTab[]; className?: string }) {
  const pathname = usePathname();
  const activeHref = resolveActiveTab(pathname ?? "", tabs);

  return (
    <nav aria-label="Report sections" className={`border-b border-default ${className}`}>
      <ul className="-mb-px flex items-stretch gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  active
                    ? "border-accent font-semibold text-accent"
                    : "border-transparent font-medium text-secondary-foreground hover:border-strong hover:text-foreground"
                }`}
              >
                {tab.label}
                {/* `undefined` renders nothing (not applicable); a real 0 renders as 0. */}
                {tab.count !== undefined && (
                  <span
                    className={`tabular rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                      active ? "bg-accent-subtle text-accent" : "bg-surface-subtle text-secondary-foreground"
                    }`}
                  >
                    {tab.count.toLocaleString("en-US")}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
