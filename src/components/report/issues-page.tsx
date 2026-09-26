import { ListChecks, SearchCheck, SearchX } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IssueFilterBar } from "./issue-filter-bar";
import { IssueList } from "./issue-list";
import { Pagination } from "./pagination";
import {
  buildIssueFacets,
  buildPageHref,
  filterIssues,
  paginate,
  parseIssueFilters,
  type ReportIssue,
  type SearchParamsLike,
} from "./filtering";

/**
 * The WHOLE "Issues" tab, for every report module.
 *
 * Stage 1 built this as Site Audit's `issues/page.tsx`. Stage 2 lifted it here
 * verbatim in behaviour and parameterised the four things that genuinely
 * differ between modules — the issues, the base path, the category vocabulary,
 * and the empty-state copy — so five more modules needed no copy of it.
 *
 * Everything else is unchanged and deliberately so: all filter state lives in
 * the URL and is parsed here on the SERVER from `searchParams`. There is no
 * client-side filter state anywhere. The chips are links, the search box is a
 * real GET form that upgrades to a soft navigation, and the rows come from
 * data the calling Server Component already fetched once. That is what makes a
 * filtered view shareable and the back button meaningful.
 *
 * The list is paginated across the flat severity-then-breadth ordering and
 * only then grouped, so a section header always describes exactly the rows
 * under it on the current page.
 */
export const DEFAULT_ISSUES_PER_PAGE = 50;

export interface ReportIssuesPageProps<T extends ReportIssue> {
  issues: T[];
  /** Route of this issue list, e.g. `/websites/abc/technical/issues`. */
  basePath: string;
  /** Category (or topic) key → display label. */
  categoryLabel: (key: string) => string;
  searchParams: SearchParamsLike;

  title?: string;
  description?: string;
  perPage?: number;

  /**
   * `false` when no crawl has completed. Rendered as a DIFFERENT state from
   * "no issues found": "we have not measured this yet" and "we measured and
   * found nothing" are opposite facts.
   */
  hasData?: boolean;
  noDataTitle?: string;
  noDataDescription?: string;
  noDataActionLabel?: string;
  noDataActionHref?: string;
  noDataIcon?: LucideIcon;

  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  /** Optional extra block under the empty state (e.g. Schema's "no markup found" nuance). */
  emptyExtra?: React.ReactNode;

  searchLabel?: string;
  searchPlaceholder?: string;
  /** Facet-group heading noun, shown by `IssueFilterBar` — e.g. "Area" vs "Category". */
  categoryFacetLabel?: string;
}

export function ReportIssuesPage<T extends ReportIssue>({
  issues,
  basePath,
  categoryLabel,
  searchParams,
  title = "All issues",
  description = "One entry per distinct rule, aggregated across every page it fires on — not one row per page. Grouped by severity, then ordered by how many pages each affects.",
  perPage = DEFAULT_ISSUES_PER_PAGE,
  hasData = true,
  noDataTitle = "No crawl yet",
  noDataDescription = "Issues are only known after a crawl has completed.",
  noDataActionLabel,
  noDataActionHref,
  noDataIcon = SearchCheck,
  emptyTitle = "No issues found",
  emptyDescription = "The most recent completed crawl found no rule violations here.",
  emptyIcon = ListChecks,
  emptyExtra,
  searchLabel = "Search issues",
  searchPlaceholder = "Search issues by name or rule key",
  categoryFacetLabel,
}: ReportIssuesPageProps<T>) {
  const filters = parseIssueFilters(searchParams);

  const facets = buildIssueFacets(issues, filters);
  const filtered = filterIssues(issues, filters);
  const slice = paginate(filtered, filters.page, perPage);

  const rows = slice.items.map((issue) => ({
    ...issue,
    href: `${basePath}/${encodeURIComponent(issue.ruleKey)}`,
    categoryLabel: categoryLabel(issue.category),
  }));

  const categoryLabels = Object.fromEntries(facets.categories.map((facet) => [facet.value, categoryLabel(facet.value)]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!hasData ? (
          <EmptyState
            icon={noDataIcon}
            title={noDataTitle}
            description={noDataDescription}
            actionLabel={noDataActionLabel}
            actionHref={noDataActionHref}
          />
        ) : issues.length === 0 ? (
          <>
            <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
            {emptyExtra}
          </>
        ) : (
          <>
            <IssueFilterBar
              basePath={basePath}
              filters={filters}
              facets={facets}
              categoryLabels={categoryLabels}
              totalMatching={filtered.length}
              totalAll={issues.length}
              searchLabel={searchLabel}
              searchPlaceholder={searchPlaceholder}
              categoryFacetLabel={categoryFacetLabel}
            />

            {filtered.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No issues match these filters"
                description="Nothing here matches the current search and filter combination."
                actionLabel="Clear all filters"
                actionHref={basePath}
              />
            ) : (
              <>
                <IssueList issues={rows} />
                <Pagination
                  page={slice.page}
                  totalPages={slice.totalPages}
                  total={slice.total}
                  firstItemIndex={slice.firstItemIndex}
                  lastItemIndex={slice.lastItemIndex}
                  itemNoun="issues"
                  label="Issue list pages"
                  buildHref={(target) => buildPageHref(basePath, filters, target)}
                />
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
