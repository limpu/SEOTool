import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { ReportHeader, type ReportChip } from "@/components/report/report-header";
import { ReportTabs } from "@/components/report/report-tabs";

import { loadKeywordsReport } from "./data";

/**
 * Stage 3B — shared chrome for the Keywords / SERP report.
 *
 * WHY THIS MODULE GETS TABS AND COMPETITORS / GOOGLE ANALYTICS DO NOT
 * -------------------------------------------------------------------
 * Tabs are only worth their chrome when there are genuinely SIBLING views of
 * the same subject. Keywords has two: a portfolio-level question ("how is my
 * tracked set doing overall — how many rank on page one, what moved") and a
 * record-level one ("show me the list so I can find one"). Those are different
 * questions over the same data, answered by different layouts, and both are
 * top-level destinations a user arrives at directly. A keyword's own detail is
 * a CHILD of the list, not a third sibling, so it is a nested route under
 * `tracked/[keywordId]` rather than a third tab — exactly the relationship
 * Stage 1 established between Issues and an issue's drill-down.
 *
 * This is NOT the issue-module layout: `ModuleReportLayout` resolves a
 * `ModuleKey` and reads `seo_issues`, and Keywords has neither. The header
 * chips below therefore describe the tracked SET and the GSC link, not a crawl.
 */
export default async function KeywordsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { site, access } = await requireWorkspacePage(id, "keywords");
  if (!access.entitled) return <UpgradeRequired label="Keywords / SERP tracking" />;

  const data = await loadKeywordsReport(site.id);

  const chips: ReportChip[] = [
    {
      label: "Keywords tracked",
      // A real 0 is a real answer here — the user has added none yet.
      value: data.keywords.length.toLocaleString("en-US"),
    },
    {
      label: "With Search Console data",
      value: data.gscHasSyncedQueries
        ? `${data.gscMatchedCount.toLocaleString("en-US")} of ${data.keywords.length.toLocaleString("en-US")}`
        : "Not available",
      title: data.gscHasSyncedQueries
        ? "Tracked keywords that exactly match a query in the last synced Search Console range."
        : "Search Console is not connected, has no property selected, or has never completed a sync for this website.",
    },
    {
      label: "Synced range",
      value:
        data.gscRangeStart && data.gscRangeEnd ? `${data.gscRangeStart} → ${data.gscRangeEnd}` : "No sync yet",
    },
  ];

  const base = `/websites/${site.id}/keywords`;

  return (
    <div className="space-y-5">
      <ReportHeader title="Keywords / SERP" siteName={site.name} siteUrl={site.url} chips={chips} />

      <ReportTabs
        tabs={[
          { label: "Overview", href: base },
          { label: "Keywords", href: `${base}/tracked`, count: data.keywords.length },
        ]}
      />

      <p className="flex items-start gap-2 rounded-lg border border-default bg-surface-subtle px-3 py-2 text-xs text-secondary-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span>
          This platform never performs an automated Google search. Positions come from two clearly separated sources:
          rank checks <strong className="font-semibold">you log manually</strong> (self-reported, labelled
          &ldquo;Manual entry&rdquo;), and <strong className="font-semibold">Google Search Console</strong> where a
          tracked keyword exactly matches a synced query. The two are never merged into one unlabelled number.
        </span>
      </p>

      {children}
    </div>
  );
}
