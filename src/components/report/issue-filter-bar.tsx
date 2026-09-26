import Link from "next/link";
import { Check, FilterX } from "lucide-react";

import { SEVERITY_LABELS } from "@/components/website/severity";
import type { Severity } from "@/lib/scoring/formula";
import { ReportSearchForm } from "./report-search-form";
import { buildFacetHref, buildQueryString, type IssueFacets, type IssueFilters } from "./filtering";

/**
 * Search box + category chips + severity chips for an issue list.
 * MODULE-AGNOSTIC — the caller supplies the facets and the category labels.
 *
 * Everything is URL-driven. The chips are plain `<Link>`s to the same route
 * with one facet toggled, computed on the SERVER from the current filters, so:
 *
 *  - a filtered view is shareable and bookmarkable,
 *  - the back button undoes a filter,
 *  - filtering works with no client JavaScript at all (only the search box
 *    upgrades itself, and it degrades to a real GET form),
 *  - and there is no client filter state that could disagree with the rows.
 *
 * Accessibility: the chips are links, so they are keyboard-navigable and
 * focusable in DOM order for free. Selection is carried by `aria-pressed`-free
 * honest markup — a check glyph and a weight/fill change, not colour alone —
 * and each chip's accessible name spells out the toggle ("Filter by Critical,
 * 9 issues"), because "Critical 9" alone does not say what clicking does.
 */
export function IssueFilterBar({
  basePath,
  filters,
  facets,
  categoryLabels,
  totalMatching,
  totalAll,
  searchLabel = "Search issues",
  searchPlaceholder = "Search issues by name or rule key",
  categoryFacetLabel = "category",
}: {
  basePath: string;
  filters: IssueFilters;
  facets: IssueFacets;
  /** category key → display label. Missing keys fall back to the raw key. */
  categoryLabels: Record<string, string>;
  totalMatching: number;
  totalAll: number;
  searchLabel?: string;
  searchPlaceholder?: string;
  /**
   * What the first facet axis is CALLED in this report. Site Audit facets on
   * the DB `issue_category` enum ("category"); a single-module report facets
   * on that module's own topic vocabulary, where "area" is the honest word.
   * Only the wording changes — the axis, the param name (`?category=`) and
   * every filtering rule are identical.
   */
  categoryFacetLabel?: string;
}) {
  const hasActiveFilters =
    filters.query !== "" || filters.categories.length > 0 || filters.severities.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <ReportSearchForm
          action={basePath}
          value={filters.query}
          hiddenParams={{ category: filters.categories, severity: filters.severities }}
          label={searchLabel}
          placeholder={searchPlaceholder}
          className="w-full sm:w-80"
        />

        <p className="tabular text-xs text-secondary-foreground" role="status">
          {hasActiveFilters
            ? `${totalMatching.toLocaleString("en-US")} of ${totalAll.toLocaleString("en-US")} issues match`
            : `${totalAll.toLocaleString("en-US")} issues`}
        </p>

        {hasActiveFilters && (
          <Link
            href={basePath}
            className="inline-flex items-center gap-1 rounded-md text-xs font-semibold text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
            Clear all filters
          </Link>
        )}
      </div>

      <FacetGroup
        legend={`Filter by ${categoryFacetLabel}`}
        options={facets.categories.map((option) => ({
          ...option,
          label: categoryLabels[option.value] ?? option.value,
          href: buildFacetHref(basePath, filters, "category", option.value),
        }))}
      />

      <FacetGroup
        legend="Filter by severity"
        options={facets.severities.map((option) => ({
          ...option,
          label: SEVERITY_LABELS[option.value as Severity] ?? option.value,
          href: buildFacetHref(basePath, filters, "severity", option.value),
        }))}
      />
    </div>
  );
}

function FacetGroup({
  legend,
  options,
}: {
  legend: string;
  options: { value: string; label: string; count: number; active: boolean; href: string }[];
}) {
  if (options.length === 0) return null;

  return (
    <nav aria-label={legend} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-xs font-medium text-muted">{legend.replace("Filter by ", "")}:</span>
      {options.map((option) => (
        <Link
          key={option.value}
          href={option.href}
          aria-label={`${option.active ? "Remove filter" : "Filter by"} ${option.label}, ${option.count} ${
            option.count === 1 ? "issue" : "issues"
          }`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            option.active
              ? "border-accent bg-accent-subtle font-semibold text-accent"
              : "border-default bg-surface font-medium text-secondary-foreground hover:bg-surface-hover hover:text-foreground"
          }`}
        >
          {/* Selection is marked by a glyph and a weight change, never by colour alone. */}
          {option.active && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
          <span aria-hidden="true">{option.label}</span>
          {/* A real, measured 0 is shown as 0 — it explains an empty list rather than hiding it. */}
          <span className="tabular text-muted" aria-hidden="true">
            {option.count.toLocaleString("en-US")}
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** Re-exported for callers that need the same query-string rules for a "back to list" link. */
export { buildQueryString };
