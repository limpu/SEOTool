/**
 * Pure model for the in-report tab bar. No React, so the active-tab rule is
 * unit-testable (`tests/unit/report-tabs.test.ts`).
 *
 * The tabs are REAL NESTED ROUTES, not client-side tab state, so every tab has
 * a shareable URL and the browser back button works. That makes "which tab is
 * active" a question about the current pathname rather than about component
 * state — and that question has one subtlety worth encoding once, here,
 * instead of in every module's tab bar.
 */

export interface ReportTab {
  label: string;
  href: string;
  /**
   * Optional badge count. `undefined` means "not applicable / not measured"
   * and renders no badge at all; a real `0` renders as `0` — those are
   * different facts and must stay distinguishable (Section 79 #3).
   */
  count?: number;
}

function normalise(path: string): string {
  const withoutQuery = path.split("?")[0].split("#")[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) return withoutQuery.slice(0, -1);
  return withoutQuery;
}

/**
 * Returns the href of the tab that owns `pathname`, or `null` when none does.
 *
 * The rule is LONGEST MATCHING PREFIX, and it exists because the first tab's
 * href is a prefix of every other tab's href — `/site-audit` is a prefix of
 * `/site-audit/issues`. A naive `startsWith` check would light up "Overview"
 * on every page of the report. A naive exact-match check would light up
 * nothing at all on a drill-down route such as
 * `/site-audit/issues/TECH_MISSING_HSTS`, where "Issues" is plainly still the
 * section the user is in.
 *
 * A prefix only counts on a path SEGMENT boundary, so a hypothetical
 * `/site-audit-archive` never activates the `/site-audit` tab.
 */
export function resolveActiveTab(pathname: string, tabs: ReportTab[]): string | null {
  const current = normalise(pathname);
  let best: string | null = null;

  for (const tab of tabs) {
    const href = normalise(tab.href);
    const matches = current === href || current.startsWith(`${href}/`);
    if (!matches) continue;
    if (best === null || href.length > normalise(best).length) best = tab.href;
  }

  return best;
}
