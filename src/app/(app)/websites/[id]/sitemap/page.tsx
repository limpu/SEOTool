import Link from "next/link";
import { SearchCheck } from "lucide-react";

import { UpgradeRequired } from "@/components/website/upgrade-required";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ModuleSeverityKpis, ModuleTopicGrid, ModuleTopIssues, StatusLine } from "@/components/report/module-overview";
import { topicLabel } from "@/components/report/module-definitions";

import { SiteFilesPanel } from "@/components/report/site-files-panel";
import { listSitemapDocuments } from "@/lib/site-files/queries";

import { requireModulePage } from "../_module-report/chrome";
import { loadModuleReport } from "../_module-report/data";

/**
 * Sitemap → Overview tab.
 *
 * The leading question here is binary and site-level — IS THERE A SITEMAP? —
 * so this Overview leads with a plain-language status block rather than a KPI
 * grid. Everything under it only means anything if the answer was yes.
 *
 * WHERE THE "found / not found" ANSWER COMES FROM
 * ----------------------------------------------
 * `TECH_SITEMAP_MISSING` — a `TECH_`-prefixed rule, so
 * `computeWebsiteModuleReport("sitemap")` cannot see it. Rather than re-route
 * rule prefixes (a backend change, and one that would also remove the finding
 * from Technical SEO where it legitimately belongs), the loader reads that one
 * key back directly. See `siteSignals` in `../_module-report/data.ts`.
 *
 * A DATA LIMITATION THAT PHASE 37 CLOSED
 * --------------------------------------
 * This page used to state, out loud, that "sitemap documents found, URL
 * counts" were unavailable: `analyzeSitemaps()` ran inside the crawl and its
 * document list and URL set were used to evaluate rules and then DISCARDED,
 * so only `seo_issues` rows survived and there was no honest way to report a
 * document count.
 *
 * Phase 37 built that persistence (`sitemap_documents`), so the counts are now
 * real measurements read back from the database — see the "Sitemap files"
 * panel below. Nothing on this page is derived or estimated: a document with
 * no stored parse still reports "Not parsed", and a site with no stored row at
 * all still reports "Never checked".
 */
export default async function SitemapOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { definition, site, access } = await requireModulePage("sitemap", id);
  if (!access.entitled) return <UpgradeRequired label={definition.label} />;

  const data = await loadModuleReport(site.id, "sitemap");
  // Phase 37 — read-only over already-stored rows; no third-party fetch on load.
  const sitemapFiles = await listSitemapDocuments(site.id);
  const base = `/websites/${site.id}/${definition.slug}`;
  const issuesPath = `${base}/issues`;
  const crawlHistoryHref = `/websites/${site.id}/site-audit#crawl-history`;
  const technicalIssuesPath = `/websites/${site.id}/technical/issues`;

  const signals = data.siteSignals;
  const sitemapMissing = signals?.TECH_SITEMAP_MISSING;
  // Three distinct states, never collapsed into two: not assessed (no
  // completed crawl), assessed-and-absent, assessed-and-present.
  const discovery: "unassessed" | "missing" | "found" = !data.hasCompletedCrawl
    ? "unassessed"
    : sitemapMissing?.fired
      ? "missing"
      : "found";

  const previewIssues = data.issues.slice(0, 6).map((issue) => ({
    ...issue,
    href: `${issuesPath}/${encodeURIComponent(issue.ruleKey)}`,
    categoryLabel: topicLabel("sitemap", issue.category),
  }));

  // Findings per declared area, including the areas with none — but ONLY
  // rendered when a sitemap was actually discovered, because "0 problems with
  // the sitemap file" is meaningless if there is no sitemap file.
  const areaFindings = definition.topics.map((topic) => ({
    ...topic,
    issueCount: data.issues.filter((issue) => issue.category === topic.key).length,
    affectedPageCount: data.issues
      .filter((issue) => issue.category === topic.key)
      .reduce((sum, issue) => sum + issue.affectedPageCount, 0),
  }));

  return (
    <div className="space-y-5">
      {/* ─── 1. Does a sitemap exist at all? ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Sitemap discovery</CardTitle>
          <CardDescription>
            An XML sitemap tells search engines which URLs you want them to know about. The crawler looks for one in
            robots.txt and at the site root.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {discovery === "unassessed" ? (
            <EmptyState
              icon={SearchCheck}
              title="Not assessed"
              description="No crawl has completed for this site yet, so nothing is known about its sitemap."
              actionLabel="Go to crawl history"
              actionHref={crawlHistoryHref}
            />
          ) : (
            <ul>
              <StatusLine
                label="XML sitemap"
                detail={
                  discovery === "missing"
                    ? "No sitemap was found. Search engines can still discover pages by following links, but a sitemap is the most direct way to tell them what exists."
                    : "A sitemap was discovered during the last completed crawl, and the checks below were run against it."
                }
                evidence={discovery === "missing" ? sitemapMissing?.evidence : undefined}
                verdict={
                  discovery === "missing" ? (
                    <Badge variant="warning">Not found</Badge>
                  ) : (
                    <Badge variant="good">Found</Badge>
                  )
                }
                action={
                  discovery === "missing" ? (
                    <Link
                      href={`${technicalIssuesPath}/TECH_SITEMAP_MISSING`}
                      className="rounded-md text-xs font-semibold text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      View this finding in Technical SEO →
                    </Link>
                  ) : undefined
                }
              />
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ─── 1b. The actual files (Phase 37) ─── */}
      <SiteFilesPanel
        websiteId={site.id}
        title="Sitemap files"
        description="Every sitemap document this platform has recorded for the site: its status, a link to it, and — for XML sitemaps — the file itself and what parsing it found."
        entries={sitemapFiles}
        crawlHistoryHref={crawlHistoryHref}
        allowedTypes={["sitemap_xml", "sitemap_html"]}
        defaultType="sitemap_xml"
      />

      {/* ─── 2. What the sitemap checks found — only meaningful once found. ─── */}
      {discovery === "found" && (
        <Card>
          <CardHeader>
            <CardTitle>Checks run against the sitemap</CardTitle>
            <CardDescription>
              Each area the crawler evaluated. &quot;No findings&quot; means the check ran and recorded nothing — the
              sitemap was discovered, so every one of these was genuinely evaluated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul>
              {areaFindings.map((area) => (
                <StatusLine
                  key={area.key}
                  label={area.label}
                  detail={
                    area.issueCount === 0
                      ? "No findings recorded for this area in the last completed crawl."
                      : `${area.issueCount.toLocaleString("en-US")} finding${
                          area.issueCount === 1 ? "" : "s"
                        }, across ${area.affectedPageCount.toLocaleString("en-US")} affected page${
                          area.affectedPageCount === 1 ? "" : "s"
                        }.`
                  }
                  verdict={
                    area.issueCount === 0 ? (
                      <Badge variant="good">No findings</Badge>
                    ) : (
                      <Badge variant="warning">{area.issueCount.toLocaleString("en-US")} to review</Badge>
                    )
                  }
                  action={
                    area.issueCount > 0 ? (
                      <Link
                        href={`${issuesPath}?category=${encodeURIComponent(area.key)}`}
                        className="rounded-md text-xs font-semibold text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        View findings →
                      </Link>
                    ) : undefined
                  }
                />
              ))}
            </ul>

            <Alert variant="info">
              <p className="text-sm">
                Which sitemap files were found, how many URLs each lists, and the XML itself are shown in the
                &quot;Sitemap files&quot; panel below — stored during the crawl (Phase 37) rather than recomputed, so
                nothing here is fetched when this page loads.
              </p>
            </Alert>
          </CardContent>
        </Card>
      )}

      <ModuleSeverityKpis
        countsBySeverity={data.countsBySeverity}
        totalIssueTypes={data.totalIssueTypes}
        totalAffectedPageInstances={data.totalAffectedPageInstances}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="Sitemap findings by severity"
        description={
          discovery === "missing"
            ? "No sitemap was found, so these rules had nothing to evaluate — a zero below means absence, not correctness."
            : "Distinct issue types recorded against the sitemap in the most recent completed crawl."
        }
      />

      <ModuleTopicGrid
        topics={data.topics}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="By sitemap area"
        description="Every area with at least one finding, linking into the pre-filtered issue list. An area with no findings is not listed here — the checklist above covers those."
      />

      <ModuleTopIssues
        issues={previewIssues}
        totalIssueTypes={data.totalIssueTypes}
        issuesPath={issuesPath}
        crawlHistoryHref={crawlHistoryHref}
        hasCompletedCrawl={data.hasCompletedCrawl}
        emptyTitle={discovery === "missing" ? "No sitemap to check" : "No sitemap problems found"}
        emptyDescription={
          discovery === "missing"
            ? "No sitemap was found during the last completed crawl, so no sitemap rules could fire."
            : "The sitemap discovered in the last completed crawl passed every check."
        }
      />
    </div>
  );
}
