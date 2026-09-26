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
import { listRobotsFiles } from "@/lib/site-files/queries";

import { requireModulePage } from "../_module-report/chrome";
import { loadModuleReport } from "../_module-report/data";
import type { ModuleIssue } from "../_module-report/data";

/**
 * Robots.txt → Overview tab.
 *
 * This is the module whose findings are least self-explanatory, so this
 * Overview is written as PLAIN LANGUAGE BEHAVIOUR rather than as counts:
 * "does the file exist", "does it block the whole site", "does it block the
 * homepage", "does it block CSS/JS", "do any lines fail to parse", "does it
 * name AI crawlers". Each line is one sentence a non-specialist can act on,
 * with the crawler's own evidence shown verbatim underneath.
 *
 * NEUTRALITY IS DELIBERATE. Blocking a crawler is frequently an intentional
 * policy decision, and the underlying rules say so themselves (the AI-crawler
 * rules are `info` severity precisely for this reason). So the wording
 * describes what robots.txt currently permits or disallows and asks the user
 * to confirm intent; it never asserts that a block is a mistake, and never
 * claims a crawler will or will not actually fetch anything.
 *
 * Two of the six lines come from rules that live OUTSIDE this module:
 * `TECH_ROBOTS_TXT_MISSING` (whether the file exists) and
 * `TECH_BLOCKED_BY_ROBOTS_TXT` (pages the crawler skipped) are `TECH_`-keyed,
 * and `AI_CRAWLER_BLOCKED` / `AI_CRAWLER_PARTIALLY_BLOCKED` belong to AI
 * Search Intelligence. All are read back by key in the loader rather than
 * re-routed, so no finding is moved out of the report it also belongs to, and
 * each line links to the module that owns it.
 */
export default async function RobotsOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { definition, site, access } = await requireModulePage("robots", id);
  if (!access.entitled) return <UpgradeRequired label={definition.label} />;

  const data = await loadModuleReport(site.id, "robots");
  // Phase 37 — read-only over already-stored rows; no third-party fetch on load.
  const robotsFileEntries = await listRobotsFiles(site.id);
  const base = `/websites/${site.id}/${definition.slug}`;
  const issuesPath = `${base}/issues`;
  const crawlHistoryHref = `/websites/${site.id}/site-audit#crawl-history`;
  const technicalIssuesPath = `/websites/${site.id}/technical/issues`;

  const signals = data.siteSignals;
  const robotsMissing = signals?.TECH_ROBOTS_TXT_MISSING;
  const blockedPages = signals?.TECH_BLOCKED_BY_ROBOTS_TXT;
  const aiBlocked = signals?.AI_CRAWLER_BLOCKED;
  const aiPartial = signals?.AI_CRAWLER_PARTIALLY_BLOCKED;

  const presence: "unassessed" | "missing" | "found" = !data.hasCompletedCrawl
    ? "unassessed"
    : robotsMissing?.fired
      ? "missing"
      : "found";

  const findIssue = (ruleKey: string): ModuleIssue | undefined =>
    data.issues.find((issue) => issue.ruleKey === ruleKey);

  const disallowAll = findIssue("ROBOTS_DISALLOW_ALL");
  const homepageBlocked = findIssue("ROBOTS_HOMEPAGE_BLOCKED");
  const resourceBlocked = findIssue("ROBOTS_RESOURCE_BLOCKED");
  const syntaxError = findIssue("ROBOTS_SYNTAX_ERROR");
  const aiCustomRules = findIssue("ROBOTS_AI_CRAWLER_CUSTOM_RULES");

  const previewIssues = data.issues.slice(0, 6).map((issue) => ({
    ...issue,
    href: `${issuesPath}/${encodeURIComponent(issue.ruleKey)}`,
    categoryLabel: topicLabel("robots", issue.category),
  }));

  /** A link into this module's own detail page for one rule. */
  function ruleLink(issue: ModuleIssue | undefined) {
    if (!issue) return undefined;
    return (
      <Link
        href={`${issuesPath}/${encodeURIComponent(issue.ruleKey)}`}
        className="rounded-md text-xs font-semibold text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        View this finding →
      </Link>
    );
  }

  const aiSignalCount = (aiCustomRules ? 1 : 0) + (aiBlocked?.fired ? 1 : 0) + (aiPartial?.fired ? 1 : 0);

  return (
    <div className="space-y-5">
      {/* ─── 1. What robots.txt actually does, in plain language. ─── */}
      <Card>
        <CardHeader>
          <CardTitle>What your robots.txt is telling crawlers</CardTitle>
          <CardDescription>
            robots.txt is a plain-text file at the root of your site that asks crawlers not to fetch certain paths. It
            is a request, not a lock — and blocking something is often deliberate, so treat each line below as
            something to confirm rather than automatically fix.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {presence === "unassessed" ? (
            <EmptyState
              icon={SearchCheck}
              title="Not assessed"
              description="No crawl has completed for this site yet, so nothing is known about its robots.txt."
              actionLabel="Go to crawl history"
              actionHref={crawlHistoryHref}
            />
          ) : presence === "missing" ? (
            <>
              <ul>
                <StatusLine
                  label="robots.txt file"
                  detail="No robots.txt was found at the site root. That is not in itself a problem — with no file, crawlers treat the whole site as allowed. It does mean you have no way to ask them to skip anything."
                  evidence={robotsMissing?.evidence}
                  verdict={<Badge variant="unknown">Not found</Badge>}
                  action={
                    <Link
                      href={`${technicalIssuesPath}/TECH_ROBOTS_TXT_MISSING`}
                      className="rounded-md text-xs font-semibold text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      View this finding in Technical SEO →
                    </Link>
                  }
                />
              </ul>
              <Alert variant="info">
                <p className="text-sm">
                  The behaviour checks below (whole-site blocking, homepage blocking, syntax, AI-crawler rules) only run
                  when a robots.txt exists. With no file, none of them was evaluated — so there are no results to show,
                  rather than passing results.
                </p>
              </Alert>
            </>
          ) : (
            <ul>
              <StatusLine
                label="robots.txt file"
                detail="A robots.txt was found at the site root and parsed during the last completed crawl."
                verdict={<Badge variant="good">Found</Badge>}
              />

              <StatusLine
                label="Whole-site blocking"
                detail={
                  disallowAll
                    ? "The effective rules for general crawlers disallow everything. If that is not deliberate, no page on this site can be crawled."
                    : "robots.txt does not disallow the whole site to general crawlers."
                }
                evidence={disallowAll?.affectedPages.map((page) => page.evidence ?? "").filter(Boolean)}
                verdict={disallowAll ? <Badge variant="critical">Blocks everything</Badge> : <Badge variant="good">Not blocked</Badge>}
                action={ruleLink(disallowAll)}
              />

              <StatusLine
                label="Homepage"
                detail={
                  homepageBlocked
                    ? "The homepage path is disallowed under the effective rules. This severely limits how the rest of the site is discovered."
                    : "The homepage is not disallowed under the effective rules."
                }
                evidence={homepageBlocked?.affectedPages.map((page) => page.evidence ?? "").filter(Boolean)}
                verdict={homepageBlocked ? <Badge variant="critical">Blocked</Badge> : <Badge variant="good">Allowed</Badge>}
                action={ruleLink(homepageBlocked)}
              />

              <StatusLine
                label="CSS and JavaScript"
                detail={
                  resourceBlocked
                    ? "Paths that look like stylesheets or scripts are disallowed. Search engines that cannot fetch those may render your pages incorrectly."
                    : "No render-critical CSS or JavaScript paths are disallowed."
                }
                evidence={resourceBlocked?.affectedPages.map((page) => page.evidence ?? "").filter(Boolean)}
                verdict={resourceBlocked ? <Badge variant="warning">Blocked</Badge> : <Badge variant="good">Allowed</Badge>}
                action={ruleLink(resourceBlocked)}
              />

              <StatusLine
                label="File syntax"
                detail={
                  syntaxError
                    ? "One or more lines do not parse as a valid directive. Crawlers usually ignore lines like these, which may not be what you intended."
                    : "Every line in the file parsed as a valid directive."
                }
                evidence={syntaxError?.affectedPages.map((page) => page.evidence ?? "").filter(Boolean)}
                verdict={syntaxError ? <Badge variant="warning">Problem found</Badge> : <Badge variant="good">Parses cleanly</Badge>}
                action={ruleLink(syntaxError)}
              />

              <StatusLine
                label="Pages skipped during this crawl"
                detail={
                  blockedPages?.fired
                    ? `${blockedPages.count.toLocaleString("en-US")} discovered URL${
                        blockedPages.count === 1 ? " was" : "s were"
                      } not fetched because robots.txt disallows them. Those pages are absent from every other report as a result.`
                    : "No discovered URL was skipped because of robots.txt during the last completed crawl."
                }
                verdict={
                  blockedPages?.fired ? (
                    <Badge variant="warning">{blockedPages.count.toLocaleString("en-US")} skipped</Badge>
                  ) : (
                    <Badge variant="good">None skipped</Badge>
                  )
                }
                action={
                  blockedPages?.fired ? (
                    <Link
                      href={`${technicalIssuesPath}/TECH_BLOCKED_BY_ROBOTS_TXT`}
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

      {/* ─── 2. AI crawlers — only once a file exists to have rules in. ─── */}
      {presence === "found" && (
        <Card>
          <CardHeader>
            <CardTitle>AI crawlers</CardTitle>
            <CardDescription>
              Some robots.txt files name specific AI and LLM crawlers in their own User-agent groups. Whether to allow
              them is a policy choice, so these are reported as signals to confirm, never as defects.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul>
              <StatusLine
                label="Named AI-crawler groups"
                detail={
                  aiCustomRules
                    ? "This robots.txt defines at least one dedicated User-agent group for a named AI crawler, so AI-search visibility may differ by crawler."
                    : "No dedicated User-agent group for a named AI crawler was found. Those crawlers fall under whatever the general rules say."
                }
                evidence={aiCustomRules?.affectedPages.map((page) => page.evidence ?? "").filter(Boolean)}
                verdict={
                  aiCustomRules ? <Badge variant="neutral">Custom rules present</Badge> : <Badge variant="neutral">No custom rules</Badge>
                }
                action={ruleLink(aiCustomRules)}
              />

              <StatusLine
                label="Known AI crawlers fully disallowed"
                detail={
                  aiBlocked?.fired
                    ? "One or more known AI/LLM crawlers are fully disallowed by the effective rules. This may be entirely intentional."
                    : "No known AI/LLM crawler is fully disallowed by the effective rules."
                }
                evidence={aiBlocked?.evidence}
                verdict={aiBlocked?.fired ? <Badge variant="neutral">Disallowed</Badge> : <Badge variant="neutral">Not disallowed</Badge>}
              />

              <StatusLine
                label="Known AI crawlers partially disallowed"
                detail={
                  aiPartial?.fired
                    ? "One or more known AI/LLM crawlers are allowed on some paths and disallowed on others."
                    : "No known AI/LLM crawler has a mixed allow/disallow split."
                }
                evidence={aiPartial?.evidence}
                verdict={aiPartial?.fired ? <Badge variant="neutral">Partially disallowed</Badge> : <Badge variant="neutral">No split</Badge>}
              />
            </ul>

            {aiSignalCount > 0 && (
              <p className="mt-3 text-xs text-secondary-foreground">
                Per-crawler detail lives in{" "}
                <Link
                  href={`/websites/${site.id}/ai-overview`}
                  className="rounded-sm font-semibold text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  AI Search Intelligence
                </Link>
                , which owns the AI-crawler findings.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── The file itself (Phase 37) ─── */}
      <SiteFilesPanel
        websiteId={site.id}
        title="robots.txt file"
        description="The robots.txt this platform has recorded for the site: its status, a link to it, and the file exactly as the server returned it."
        entries={robotsFileEntries}
        crawlHistoryHref={crawlHistoryHref}
        allowedTypes={["robots_txt"]}
        defaultType="robots_txt"
      />

      <ModuleSeverityKpis
        countsBySeverity={data.countsBySeverity}
        totalIssueTypes={data.totalIssueTypes}
        totalAffectedPageInstances={data.totalAffectedPageInstances}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="Robots.txt findings by severity"
        description={
          presence === "missing"
            ? "No robots.txt was found, so these rules had nothing to evaluate — a zero below means absence, not correctness."
            : "Distinct issue types recorded against robots.txt in the most recent completed crawl."
        }
      />

      <ModuleTopicGrid
        topics={data.topics}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="By robots.txt area"
        description="Every area with at least one finding, linking into the pre-filtered issue list. An area with no findings is not listed here — the plain-language checks above cover those."
      />

      <ModuleTopIssues
        issues={previewIssues}
        totalIssueTypes={data.totalIssueTypes}
        issuesPath={issuesPath}
        crawlHistoryHref={crawlHistoryHref}
        hasCompletedCrawl={data.hasCompletedCrawl}
        emptyTitle={presence === "missing" ? "No robots.txt to check" : "No robots.txt problems found"}
        emptyDescription={
          presence === "missing"
            ? "No robots.txt was found during the last completed crawl, so no robots.txt rules could fire."
            : "The robots.txt found in the last completed crawl passed every check."
        }
      />
    </div>
  );
}
