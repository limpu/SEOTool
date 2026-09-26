/**
 * Pure search / filter / grouping / pagination math for the shared SEO report
 * architecture (`src/components/report/*`).
 *
 * Deliberately free of React, DOM, Next and DB imports so every rule it
 * encodes is directly unit-testable (`tests/unit/report-filtering.test.ts`) —
 * exactly the split `src/lib/dashboard/overview-metrics.ts` already
 * established for the Overview dashboard.
 *
 * This module is MODULE-AGNOSTIC. Nothing here knows about Site Audit; it
 * operates on a minimal `ReportIssue` shape that every one of the 13 report
 * modules can satisfy from data it already has.
 *
 * The honesty rules that apply here (master doc Section 79 #3):
 *
 *  - A facet chip is only ever emitted for a value that genuinely occurs in
 *    the data. There is no "Schema (0)" chip for a site with no schema rules
 *    — an absent category is not a measured zero.
 *  - A measured zero IS shown: an active filter that currently matches
 *    nothing keeps its chip (so the user can see why the list is empty and
 *    click it off again) and the list renders an explicit "no matches" state,
 *    never an implicit blank.
 *  - Pagination never invents pages. An empty result set is page 1 of 1, not
 *    page 1 of 0.
 */

import { SEVERITY_ORDER, type Severity } from "@/lib/scoring/formula";

/** The minimum an issue must carry to be listed, searched, filtered and grouped. */
export interface ReportIssue {
  /** Stable, URL-safe identifier — also the drill-down route segment. */
  ruleKey: string;
  title: string;
  severity: Severity;
  /** Free-form grouping key (this product's `issue_category` enum, for Site Audit). */
  category: string;
  /** Distinct pages the issue fires on. A real measurement, never a placeholder. */
  affectedPageCount: number;
  /** Optional longer text, included in free-text search when present. */
  description?: string | null;
}

export interface IssueFilters {
  /** Free-text query, already trimmed. Empty string means "no query". */
  query: string;
  categories: string[];
  severities: Severity[];
  /** 1-based. Never below 1. */
  page: number;
}

export type SearchParamValue = string | string[] | undefined;
export type SearchParamsLike = Record<string, SearchParamValue>;

const SEVERITY_SET = new Set<string>(SEVERITY_ORDER);

/**
 * Normalises one search-param entry into a list of values, accepting both
 * repeated params (`?category=a&category=b`) and the comma form
 * (`?category=a,b`). Both are produced by real-world link sharing, and
 * silently dropping one of them would make a bookmarked URL behave
 * differently from the one the UI generated.
 */
export function readListParam(value: SearchParamValue): string[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const entry of raw) {
    for (const part of entry.split(",")) {
      const trimmed = part.trim();
      if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    }
  }
  return out;
}

function readStringParam(value: SearchParamValue): string {
  if (value === undefined) return "";
  return (Array.isArray(value) ? (value[0] ?? "") : value).trim();
}

/**
 * Parses a URL's search params into filter state.
 *
 * Unknown severity values are DROPPED rather than kept: severity is a closed
 * vocabulary, and a hand-edited `?severity=urgent` must not silently produce
 * an always-empty list the user cannot explain.
 */
export function parseIssueFilters(params: SearchParamsLike, options: { pageParam?: string; queryParam?: string } = {}): IssueFilters {
  const { pageParam = "page", queryParam = "q" } = options;

  const pageRaw = Number.parseInt(readStringParam(params[pageParam]), 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return {
    query: readStringParam(params[queryParam]),
    categories: readListParam(params.category),
    severities: readListParam(params.severity).filter((value): value is Severity => SEVERITY_SET.has(value)),
    page,
  };
}

/** Case-insensitive substring match across rule key, title and description. */
export function matchesQuery(issue: ReportIssue, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    issue.title.toLowerCase().includes(needle) ||
    issue.ruleKey.toLowerCase().includes(needle) ||
    (issue.description ?? "").toLowerCase().includes(needle)
  );
}

/**
 * Applies the whole filter set. An empty `categories`/`severities` list means
 * "no constraint on this axis" — NOT "match nothing", which is the bug that
 * makes a freshly-loaded filtered page look like it has no data.
 */
export function filterIssues<T extends ReportIssue>(issues: T[], filters: Pick<IssueFilters, "query" | "categories" | "severities">): T[] {
  return issues.filter((issue) => {
    if (filters.categories.length > 0 && !filters.categories.includes(issue.category)) return false;
    if (filters.severities.length > 0 && !filters.severities.includes(issue.severity)) return false;
    return matchesQuery(issue, filters.query);
  });
}

// ─── Grouping ──────────────────────────────────────────────────────────────

export interface IssueGroup<T extends ReportIssue> {
  severity: Severity;
  issues: T[];
}

/**
 * Groups by severity in the project's fixed critical → info order.
 *
 * Empty tiers are OMITTED. A section header reading "Errors (0)" above no rows
 * is noise, and — more importantly — the count in a section header is a
 * measurement of what is in that section, so a header with nothing under it
 * would be the only place in the report where a heading is not backed by rows.
 * Order is always the severity order, never re-sorted by count: the ranking of
 * severities is fixed, not data-dependent.
 */
export function groupIssuesBySeverity<T extends ReportIssue>(issues: T[]): IssueGroup<T>[] {
  const groups: IssueGroup<T>[] = [];
  for (const severity of SEVERITY_ORDER) {
    const matching = issues.filter((issue) => issue.severity === severity);
    if (matching.length > 0) groups.push({ severity, issues: matching });
  }
  return groups;
}

// ─── Facets ────────────────────────────────────────────────────────────────

export interface FacetOption {
  value: string;
  count: number;
  active: boolean;
}

export interface IssueFacets {
  categories: FacetOption[];
  severities: FacetOption[];
}

/**
 * Faceted counts, computed the way faceted search is supposed to work: each
 * axis is counted against the OTHER axes' filters, not against its own.
 *
 * So the "Technical" chip shows how many issues you would see if you clicked
 * it given your current severity filter and search text — which is the
 * question a user is actually asking when they read that number. Counting
 * each axis against its own filter instead would make every unselected chip
 * read 0 the moment you selected one, which is both useless and misleading.
 *
 * A chip is emitted only for a value that occurs in `issues` at all, or that
 * is currently active (an active filter matching nothing keeps its chip so it
 * can be switched off, and honestly shows its real count of 0).
 */
export function buildIssueFacets(issues: ReportIssue[], filters: Pick<IssueFilters, "query" | "categories" | "severities">): IssueFacets {
  const categoryCounts = new Map<string, number>();
  const severityCounts = new Map<Severity, number>();

  // Categories counted with the severity + query filters applied.
  for (const issue of filterIssues(issues, { query: filters.query, categories: [], severities: filters.severities })) {
    categoryCounts.set(issue.category, (categoryCounts.get(issue.category) ?? 0) + 1);
  }
  // Severities counted with the category + query filters applied.
  for (const issue of filterIssues(issues, { query: filters.query, categories: filters.categories, severities: [] })) {
    severityCounts.set(issue.severity, (severityCounts.get(issue.severity) ?? 0) + 1);
  }

  const categoryValues = new Set<string>([...issues.map((issue) => issue.category), ...filters.categories]);
  const categories = Array.from(categoryValues)
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, count: categoryCounts.get(value) ?? 0, active: filters.categories.includes(value) }));

  const severityValues = SEVERITY_ORDER.filter(
    (severity) => issues.some((issue) => issue.severity === severity) || filters.severities.includes(severity)
  );
  const severities = severityValues.map((value) => ({
    value,
    count: severityCounts.get(value) ?? 0,
    active: filters.severities.includes(value),
  }));

  return { categories, severities };
}

// ─── URL building ──────────────────────────────────────────────────────────

/** Adds `value` to a multi-value param, or removes it when already present. */
export function toggleValue(current: string[], value: string): string[] {
  return current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
}

/**
 * Builds a `?…` query string from a plain record.
 *
 * Empty strings, empty arrays and `undefined` are omitted entirely rather than
 * serialised as `key=` — a bookmarked filter URL should contain exactly the
 * filters that are on, so it stays readable and diffable. Returns `""` (not
 * `"?"`) when nothing is set, so callers can concatenate unconditionally.
 */
export function buildQueryString(params: Record<string, string | string[] | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) if (entry !== "") search.append(key, entry);
    } else if (typeof value === "number") {
      search.set(key, String(value));
    } else if (value !== "") {
      search.set(key, value);
    }
  }
  const serialised = search.toString();
  return serialised ? `?${serialised}` : "";
}

/**
 * The href for toggling one facet chip. Toggling a filter always resets to
 * page 1 — staying on page 7 of a now-3-page result is a dead end that looks
 * like "no results".
 */
export function buildFacetHref(
  basePath: string,
  filters: IssueFilters,
  axis: "category" | "severity",
  value: string,
  options: { queryParam?: string } = {}
): string {
  const { queryParam = "q" } = options;
  const categories = axis === "category" ? toggleValue(filters.categories, value) : filters.categories;
  const severities = axis === "severity" ? toggleValue(filters.severities, value) : filters.severities;
  return `${basePath}${buildQueryString({ [queryParam]: filters.query, category: categories, severity: severities })}`;
}

/** The href for one page number, preserving every active filter. */
export function buildPageHref(
  basePath: string,
  filters: IssueFilters,
  page: number,
  options: { queryParam?: string; pageParam?: string } = {}
): string {
  const { queryParam = "q", pageParam = "page" } = options;
  return `${basePath}${buildQueryString({
    [queryParam]: filters.query,
    category: filters.categories,
    severity: filters.severities,
    // Page 1 is the default, so it is left out of the URL entirely.
    [pageParam]: page > 1 ? page : undefined,
  })}`;
}

// ─── Pagination ────────────────────────────────────────────────────────────

export interface PageSlice<T> {
  items: T[];
  /** Clamped into `[1, totalPages]` — a `?page=99` on a 3-page list lands on 3, not on a blank screen. */
  page: number;
  totalPages: number;
  total: number;
  /** 1-based index of the first item on this page; `0` when there are no items at all. */
  firstItemIndex: number;
  /** 1-based index of the last item on this page; `0` when there are no items at all. */
  lastItemIndex: number;
}

/**
 * Slices a list into one page.
 *
 * An empty list is page 1 of 1 with a `total` of 0 — a real, measured "nothing
 * matched", not "0 pages" (which reads as broken) and not a fabricated page 1
 * of some larger set.
 */
export function paginate<T>(items: T[], page: number, perPage: number): PageSlice<T> {
  const size = Math.max(1, Math.floor(perPage));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);

  return {
    items: slice,
    page: current,
    totalPages,
    total,
    firstItemIndex: total === 0 ? 0 : start + 1,
    lastItemIndex: total === 0 ? 0 : start + slice.length,
  };
}

export type PaginationSlot = number | "ellipsis";

/**
 * The page-number buttons to render: always first and last, always a window
 * around the current page, with `"ellipsis"` standing in for the gaps.
 *
 * `maxSlots` counts EVERY slot including the ellipses, so the control's width
 * is bounded no matter how many pages exist — a 400-page list must not push
 * the page into horizontal scroll on a 375px screen.
 */
export function paginationRange(page: number, totalPages: number, maxSlots = 7): PaginationSlot[] {
  const last = Math.max(1, Math.floor(totalPages));
  const current = Math.min(Math.max(1, Math.floor(page)), last);
  const slots = Math.max(5, Math.floor(maxSlots));

  if (last <= slots) return Array.from({ length: last }, (_, index) => index + 1);

  // Reserve: first, last, and two ellipsis positions.
  const windowSize = slots - 4;
  let start = current - Math.floor((windowSize - 1) / 2);
  let end = start + windowSize - 1;

  if (start < 2) {
    start = 2;
    end = start + windowSize - 1;
  }
  if (end > last - 1) {
    end = last - 1;
    start = end - windowSize + 1;
  }

  const result: PaginationSlot[] = [1];
  if (start > 2) result.push("ellipsis");
  for (let index = start; index <= end; index += 1) result.push(index);
  if (end < last - 1) result.push("ellipsis");
  result.push(last);
  return result;
}
