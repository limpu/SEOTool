import { notFound } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { ReportHeader, ReportHeaderAction, type ReportChip } from "@/components/report/report-header";
import { ReportTabs } from "@/components/report/report-tabs";
import { ReportIssuesPage } from "@/components/report/issues-page";
import { ReportIssueDetailPage } from "@/components/report/issue-detail-page";
import { formatUpdatedAt } from "@/components/charts/format";
import type { SearchParamsLike } from "@/components/report/filtering";
import { MODULE_DEFINITIONS, moduleReportTabs, topicLabel } from "@/components/report/module-definitions";
import type { ModuleKey } from "@/lib/module-reports/compute";
import type { BadgeVariant } from "@/components/ui/badge";

import { loadModuleReport } from "./data";

/**
 * Stage 2 — the shared route glue for all five issue-based module reports.
 *
 * Each module's `layout.tsx`, `issues/page.tsx` and `issues/[ruleKey]/page.tsx`
 * is a handful of lines that names its `ModuleKey` and delegates here. That is
 * the whole point of Stage 2: the Overview/Issues/Detail pattern is written
 * ONCE, not five times, and the only per-module files with real content are
 * the five Overviews — which are deliberately different from each other.
 *
 * Guarding is repeated in every segment on purpose, matching this codebase's
 * existing defense-in-depth convention: a layout that declines to render
 * `children` does NOT prevent the page segment underneath from executing, so
 * the RBAC + entitlement check has to exist in both places.
 */

/**
 * Crawl run lifecycle → badge variant. Same mapping (and same reasoning) as
 * Site Audit's: pending/cancelled are neutral chrome and running is the
 * interactive accent, because a run's lifecycle is not a verdict about the
 * site. Only completed/failed are real outcomes, so only they take a status
 * hue — and with it, an icon.
 */
const RUN_STATUS_VARIANT: Record<string, BadgeVariant> = {
  pending: "neutral",
  running: "accent",
  completed: "good",
  failed: "critical",
  cancelled: "unknown",
};

/** Resolves the site + access for a module route, or 404s / gates as appropriate. */
export async function requireModulePage(moduleKey: ModuleKey, websiteIdParam: string) {
  const definition = MODULE_DEFINITIONS[moduleKey];
  const { site, access } = await requireWorkspacePage(websiteIdParam, definition.slug);
  return { definition, site, access };
}

export async function ModuleReportLayout({
  moduleKey,
  websiteIdParam,
  children,
}: {
  moduleKey: ModuleKey;
  websiteIdParam: string;
  children: ReactNode;
}) {
  const { definition, site, access } = await requireModulePage(moduleKey, websiteIdParam);
  if (!access.entitled) return <UpgradeRequired label={definition.label} />;

  const data = await loadModuleReport(site.id, moduleKey);

  const lastCrawlAt = data.lastCrawl?.completedAt ?? data.lastCrawl?.startedAt ?? null;

  const chips: ReportChip[] = [
    {
      label: "Last updated",
      // "Never crawled" is the honest answer; a date placeholder would not be.
      value: formatUpdatedAt(lastCrawlAt) ?? "Never crawled",
    },
    {
      label: "Pages scanned",
      // The page count of the run these findings actually came from — the
      // latest COMPLETED run, which is not necessarily the latest run.
      value: data.hasCompletedCrawl ? data.report.pagesScanned.toLocaleString("en-US") : "No data",
      title: "Pages in the most recent completed crawl, which is the run this report reads.",
    },
    {
      label: "Crawl status",
      value: data.lastCrawl ? data.lastCrawl.status : "No crawl yet",
      tone: data.lastCrawl ? (RUN_STATUS_VARIANT[data.lastCrawl.status] ?? "neutral") : "unknown",
    },
  ];

  return (
    <div className="space-y-5">
      <ReportHeader
        title={definition.label}
        siteName={site.name}
        siteUrl={site.url}
        chips={chips}
        actions={
          <>
            <ReportHeaderAction href={`/websites/${site.id}/reports`}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Export
            </ReportHeaderAction>
            {/* Crawling is one site-wide operation, owned by Site Audit's
                crawl panel. Every module report links to it rather than
                shipping a second, competing "Run crawl" control. */}
            <ReportHeaderAction href={`/websites/${site.id}/site-audit#crawl-history`} variant="primary">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Run crawl
            </ReportHeaderAction>
          </>
        }
      />

      <ReportTabs tabs={moduleReportTabs(site.id, moduleKey, data.totalIssueTypes)} />

      {children}
    </div>
  );
}

export async function ModuleIssuesRoute({
  moduleKey,
  websiteIdParam,
  searchParams,
}: {
  moduleKey: ModuleKey;
  websiteIdParam: string;
  searchParams: SearchParamsLike;
}) {
  const { definition, site, access } = await requireModulePage(moduleKey, websiteIdParam);
  if (!access.entitled) return <UpgradeRequired label={definition.label} />;

  const data = await loadModuleReport(site.id, moduleKey);
  const basePath = `/websites/${site.id}/${definition.slug}/issues`;

  return (
    <ReportIssuesPage
      issues={data.issues}
      basePath={basePath}
      categoryLabel={(key) => topicLabel(moduleKey, key)}
      searchParams={searchParams}
      description={`${definition.description} One entry per distinct rule, aggregated across every page it fires on — not one row per page.`}
      hasData={data.hasCompletedCrawl}
      noDataDescription={`${definition.label} findings are only known after a crawl has completed.`}
      noDataActionLabel="Go to crawl history"
      noDataActionHref={`/websites/${site.id}/site-audit#crawl-history`}
      emptyDescription={`The most recent completed crawl recorded no ${definition.label} rule violations.`}
      emptyExtra={
        // Two modules have an AMBIGUOUS zero and say so under their empty
        // state, rather than letting it read as a clean bill of health.
        moduleKey === "schema" ? (
          <p className="text-center text-xs text-muted">
            Zero findings here can also mean no structured data was found at all. See the Overview for what markup was
            detected.
          </p>
        ) : moduleKey === "pagespeed" ? (
          <p className="mx-auto max-w-lg text-center text-xs text-muted">
            Zero findings here does NOT mean the site is fast. These rules are attached to a crawled page only when a
            Lighthouse audit ran against that page&apos;s exact URL; when the audited and crawled addresses differ,
            the audit still stands but nothing is recorded here. The real Lighthouse scores and Core Web Vitals are on
            the Overview.
          </p>
        ) : undefined
      }
      searchLabel={`Search ${definition.label} issues`}
      searchPlaceholder="Search by issue name or rule key"
      categoryFacetLabel="area"
    />
  );
}

export async function ModuleIssueDetailRoute({
  moduleKey,
  websiteIdParam,
  ruleKeyParam,
  searchParams,
}: {
  moduleKey: ModuleKey;
  websiteIdParam: string;
  ruleKeyParam: string;
  searchParams: SearchParamsLike;
}) {
  const { definition, site, access } = await requireModulePage(moduleKey, websiteIdParam);
  if (!access.entitled) return <UpgradeRequired label={definition.label} />;

  const data = await loadModuleReport(site.id, moduleKey);

  // `ruleKey` arrives from the URL, so it is VALIDATED against THIS module's
  // real rule set before anything renders. An unknown key — or a key that
  // belongs to a different module, or one that has since been fixed — is a
  // real 404, never a page built around an unrecognised string or an empty
  // shell implying the problem still exists.
  const decoded = decodeURIComponent(ruleKeyParam);
  const issue = data.issues.find((entry) => entry.ruleKey === decoded);
  if (!issue) notFound();

  return (
    <ReportIssueDetailPage
      issue={issue}
      issuesPath={`/websites/${site.id}/${definition.slug}/issues`}
      categoryLabel={(key) => topicLabel(moduleKey, key)}
      searchParams={searchParams}
    />
  );
}
