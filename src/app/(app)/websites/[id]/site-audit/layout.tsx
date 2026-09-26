import type { ReactNode } from "react";
import { Download, RefreshCw } from "lucide-react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { ReportHeader, ReportHeaderAction, type ReportChip } from "@/components/report/report-header";
import { ReportTabs } from "@/components/report/report-tabs";
import { formatUpdatedAt } from "@/components/charts/format";
import type { BadgeVariant } from "@/components/ui/badge";

import { loadSiteAuditData, siteAuditTabs } from "./data";

/**
 * Shared chrome for the whole Site Audit report: the header and the tab bar
 * that Overview, Issues and Issue-detail all sit under. Putting it in a layout
 * is what makes the tabs feel like tabs while remaining real, shareable,
 * back-button-able nested routes.
 *
 * Ownership/RBAC is re-derived here via `requireWorkspacePage` even though the
 * workspace layout above already did so, matching this codebase's existing
 * defense-in-depth convention. Each page underneath ALSO guards itself: a
 * layout that declines to render `children` does not prevent the page segment
 * from executing, so the entitlement check has to exist in both places.
 *
 * `loadSiteAuditData` is `cache()`d, so the header chips and tab counts here
 * and the page's own data come from ONE fetch per request.
 */

/**
 * Crawl run lifecycle → badge variant. Reuses the existing `CrawlPanel`
 * mapping's reasoning exactly: pending/cancelled are neutral chrome and
 * running is the interactive accent, because a run's lifecycle is not a
 * verdict about the site. Only completed/failed are real outcomes, so only
 * they take a status hue (and with it, an icon).
 */
const RUN_STATUS_VARIANT: Record<string, BadgeVariant> = {
  pending: "neutral",
  running: "accent",
  completed: "good",
  failed: "critical",
  cancelled: "unknown",
};

export default async function SiteAuditLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { site, access } = await requireWorkspacePage(id, "site-audit");
  if (!access.entitled) return <UpgradeRequired label="Site Audit" />;

  const data = await loadSiteAuditData(site.id);
  const base = `/websites/${site.id}/site-audit`;

  const lastCrawlAt = data.lastCrawl?.completedAt ?? data.lastCrawl?.startedAt ?? null;

  const chips: ReportChip[] = [
    {
      label: "Last updated",
      // "Never crawled" is the honest answer; a date placeholder would not be.
      value: formatUpdatedAt(lastCrawlAt) ?? "Never crawled",
    },
    {
      label: "Pages crawled",
      // A measured 0 stays a 0. Only a genuinely absent measurement says "No data".
      value:
        data.lastCrawl?.pagesCrawled === null || data.lastCrawl?.pagesCrawled === undefined
          ? "No data"
          : data.lastCrawl.pagesCrawled.toLocaleString("en-US"),
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
        title="Site Audit"
        siteName={site.name}
        siteUrl={site.url}
        chips={chips}
        actions={
          <>
            <ReportHeaderAction href={`/websites/${site.id}/reports`}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Export
            </ReportHeaderAction>
            {/* Deep-links to the crawl panel on the Overview tab, so run-crawl
                and the crawl history stay reachable from every tab. */}
            <ReportHeaderAction href={`${base}#crawl-history`} variant="primary">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Run crawl
            </ReportHeaderAction>
          </>
        }
      />

      <ReportTabs tabs={siteAuditTabs(site.id, data.totalIssueTypes)} />

      {children}
    </div>
  );
}
