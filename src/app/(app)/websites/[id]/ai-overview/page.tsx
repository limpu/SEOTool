import Link from "next/link";
import { Bot, FileText, ScanSearch } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { ModuleSeverityKpis, ModuleTopicGrid, ModuleTopIssues } from "@/components/report/module-overview";
import { topicLabel } from "@/components/report/module-definitions";
import { HealthGauge } from "@/components/report/metrics";
import { AiPageReadinessList, type AiPageRow } from "@/components/report/ai-page-readiness";
import { splitAssessed, uniqueAssessedDimensions, type AggregatedDimension } from "@/components/report/ai-dimensions";
import { buildQueryString } from "@/components/report/filtering";

import { SiteFilesPanel } from "@/components/report/site-files-panel";
import { listLlmsFiles } from "@/lib/site-files/queries";

import { requireModulePage } from "../_module-report/chrome";
import { loadModuleReport } from "../_module-report/data";

/**
 * AI Search Intelligence → Overview tab.
 *
 * WHAT LEADS HERE: Phase 24's three readiness composites (GEO / AEO / AI
 * Overview) and the dimensions behind them. Those are computed from real
 * structural evidence on every crawled page — headings, question phrasing,
 * lists, tables, definition lists, structured data, outbound citation anchors
 * — and they are what a user comes to this module to see. The `AEO_`/`GEO_`
 * opportunity rules underneath are the *shortfalls* of those same dimensions,
 * so showing the counts first and the scores second would be backwards.
 *
 * ─── The honesty decision this whole page is organised around ────────────
 *
 * Phase 24 deliberately leaves seven dimensions UNASSESSED — four under GEO
 * (Answerability, Evidence, Original Information, Semantic Completeness) and
 * three under AEO (Direct Answers, Evidence, Answer Completeness) — because
 * each needs semantic judgment a deterministic markup analyser cannot honestly
 * produce. They are shown here as their own labelled group, each carrying
 * Phase 24's own stated reason. They are NOT hidden (which would imply the
 * assessment is complete) and NOT rendered as 0 (which would assert a failure
 * nobody measured). A dimension that scored a genuine 0 — "no Organization or
 * Person schema anywhere on this page" — sits in the OTHER group, as a real,
 * actionable finding.
 *
 * ─── Why llms.txt and AI crawlers are here as their own topics ───────────
 *
 * `LLMS_` (11 rules, Phase 18) and `AI_` (2 rules, Phase 19) carry different
 * prefixes from `AEO_`/`GEO_` only because different phases built them. To a
 * user they are the same question — can generative engines reach, read and
 * cite this site — so this module owns all four prefixes and gives llms.txt,
 * llms-full.txt and AI-crawler access their own topic cards.
 *
 * NOTHING on this page invents an AI-visibility or citation metric. This
 * platform does not query ChatGPT, Perplexity or AI Overviews and does not
 * know whether this site has ever been cited by one; no number here claims
 * otherwise.
 *
 * Server Component; one `cache()`d fetch shared with the layout.
 */

/** One aggregated dimension row: the site average, or an explicit "Not assessed". */
function DimensionRow({ dimension }: { dimension: AggregatedDimension }) {
  const unassessed = dimension.status === "unassessed";
  return (
    <li className="flex items-start justify-between gap-4 border-b border-default py-2 text-sm last:border-0">
      <div className="min-w-0">
        <p className="font-medium text-secondary-foreground">{dimension.label}</p>
        {unassessed ? (
          <p className="mt-0.5 text-xs text-muted">{dimension.reason ?? "Not assessed by this platform."}</p>
        ) : (
          <>
            <p className="mt-0.5 text-[11px] text-muted">
              Averaged across {dimension.pagesAssessed.toLocaleString("en-US")} of{" "}
              {dimension.pagesConsidered.toLocaleString("en-US")} page
              {dimension.pagesConsidered === 1 ? "" : "s"}.
            </p>
            {dimension.exampleEvidence && (
              /* One page's own evidence, shown verbatim and labelled as an
                 example — it describes that page, NOT the whole site, and
                 must not be read as a site-wide statement. */
              <p className="mt-0.5 text-xs text-muted">
                <span className="font-medium">Example from one page:</span> {dimension.exampleEvidence}
              </p>
            )}
          </>
        )}
      </div>
      <Badge variant={unassessed ? "unknown" : "neutral"} className="shrink-0">
        {unassessed ? "Not assessed" : dimension.score}
      </Badge>
    </li>
  );
}

function DimensionSet({
  title,
  caption,
  score,
  dimensions,
}: {
  title: string;
  caption: string;
  score: number | null;
  dimensions: AggregatedDimension[];
}) {
  const { assessed, unassessed } = splitAssessed(dimensions);

  return (
    <section className="rounded-lg border border-default p-3">
      <div className="flex flex-col items-center">
        <HealthGauge score={score} label={title} caption="out of 100" size={140} />
      </div>
      <p className="mt-2 text-center text-xs text-muted">{caption}</p>

      <h4 className="mt-3 text-xs font-semibold tracking-wide text-secondary-foreground uppercase">
        Measured signals
      </h4>
      {assessed.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Nothing in this set could be measured on any crawled page.</p>
      ) : (
        <ul className="mt-1">
          {assessed.map((dimension) => (
            <DimensionRow key={dimension.key} dimension={dimension} />
          ))}
        </ul>
      )}

      {unassessed.length > 0 && (
        <>
          <h4 className="mt-3 text-xs font-semibold tracking-wide text-secondary-foreground uppercase">
            Not assessed by this platform
          </h4>
          <p className="mt-0.5 text-[11px] text-muted">
            These are shown, not hidden: leaving them out would imply the assessment above is complete. They score
            nothing and count toward nothing.
          </p>
          <ul className="mt-1">
            {unassessed.map((dimension) => (
              <DimensionRow key={dimension.key} dimension={dimension} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default async function AiSearchOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { definition, site, access } = await requireModulePage("ai_search", id);
  if (!access.entitled) return <UpgradeRequired label={definition.label} />;

  const data = await loadModuleReport(site.id, "ai_search");
  // Phase 37 — llms.txt CONTENT has been persisted by every crawl since Phase
  // 18 (`llms_files.raw_content`, `title`, `summary`, `sections`), but no
  // screen in this product ever read it back, so all of it was invisible.
  // This is a plain SELECT over those existing rows — nothing is re-fetched.
  const llmsFileEntries = await listLlmsFiles(site.id);
  const ai = data.aiSearch;
  const base = `/websites/${site.id}/${definition.slug}`;
  const issuesPath = `${base}/issues`;
  const crawlHistoryHref = `/websites/${site.id}/site-audit#crawl-history`;

  const previewIssues = data.issues.slice(0, 6).map((issue) => ({
    ...issue,
    href: `${issuesPath}/${encodeURIComponent(issue.ruleKey)}`,
    categoryLabel: topicLabel("ai_search", issue.category),
  }));

  // Worst-first: the pages a user would work on next. Every assessed page is
  // listed — nothing is truncated away.
  const pageRows: AiPageRow[] = (ai?.pages ?? [])
    .slice()
    .sort((a, b) => (a.aio.score ?? Number.POSITIVE_INFINITY) - (b.aio.score ?? Number.POSITIVE_INFINITY))
    .map((page) => ({
      pageId: page.pageId,
      url: page.url,
      geo: page.geo.score,
      aeo: page.aeo.score,
      aio: page.aio.score,
      dimensions: uniqueAssessedDimensions([page.geo.dimensions, page.aeo.dimensions, page.aio.dimensions]).map(
        (dimension) => ({
          key: dimension.key,
          label: dimension.label,
          score: dimension.score,
          evidence: dimension.evidence,
        })
      ),
    }));

  // The two topics that are about the SITE's machine-readable surface rather
  // than about page content — surfaced here so they are not buried in a
  // generic issue list.
  const llmsTopics = data.topics.filter((topic) => topic.key === "llms_txt" || topic.key === "llms_full_txt");
  const crawlerTopic = data.topics.find((topic) => topic.key === "ai_crawler_access");

  return (
    <div className="space-y-5">
      {/* ─── 1. The lead: readiness composites and their dimensions ────── */}
      <Card>
        <CardHeader>
          <CardTitle>Generative-search readiness</CardTitle>
          <CardDescription>
            Three composites computed from this platform&apos;s own deterministic analysis of crawled page structure.
            Each is the equal-weight average of that set&apos;s <em>measured</em> signals only — an unassessed
            dimension never counts toward a score.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="info">
            <p className="font-semibold">What these scores are, and what they are not.</p>
            <p className="mt-0.5 text-sm text-secondary-foreground">
              They are this product&apos;s own readiness measures, derived from markup and content structure. They are
              not official search-engine metrics, and they are not a measurement of whether this site actually appears
              in or is cited by AI Overviews, ChatGPT, Perplexity or any other generative engine — this platform does
              not query those systems and has no visibility or citation data for this site.
            </p>
          </Alert>

          {!ai || ai.pagesAssessed === 0 ? (
            <EmptyState
              icon={ScanSearch}
              title="No crawl data to assess"
              description="Readiness is computed from the pages of the most recent completed crawl. Nothing has been measured yet — this is an absence of data, not a score of zero."
              actionLabel="Go to crawl history"
              actionHref={crawlHistoryHref}
            />
          ) : (
            <>
              <p className="text-xs text-muted">
                Averaged across {ai.pagesAssessed.toLocaleString("en-US")} successfully-crawled page
                {ai.pagesAssessed === 1 ? "" : "s"} in the most recent completed crawl.
              </p>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <DimensionSet
                  title="GEO readiness"
                  caption="Generative Engine Optimisation — is this site a clear, attributable, citable source?"
                  score={ai.geo}
                  dimensions={ai.geoDimensions}
                />
                <DimensionSet
                  title="AEO readiness"
                  caption="Answer Engine Optimisation — is the content shaped so an answer can be lifted from it?"
                  score={ai.aeo}
                  dimensions={ai.aeoDimensions}
                />
                <DimensionSet
                  title="AI Overview readiness"
                  caption="The subset of signals most relevant to Google's AI Overviews."
                  score={ai.aio}
                  dimensions={ai.aioDimensions}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── 2. llms.txt — its own topic, not a buried rule ────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>llms.txt</CardTitle>
          <CardDescription>
            An emerging, voluntary convention: a plain-text file at the site root that tells language models what the
            site contains and where its important documents are. It is not a standard any engine is obliged to honour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data.hasCompletedCrawl ? (
            <EmptyState
              icon={FileText}
              title="Not assessed"
              description="llms.txt is fetched during a crawl. No crawl has completed, so nothing about it is known."
              actionLabel="Go to crawl history"
              actionHref={crawlHistoryHref}
            />
          ) : llmsTopics.length === 0 ? (
            <p className="text-sm text-secondary-foreground">
              The most recent completed crawl recorded no llms.txt findings. Note that this platform records a finding
              both when the file is <em>missing</em> and when a present file has problems — so no findings here means
              an llms.txt was found and passed every check.
            </p>
          ) : (
            <ul className="space-y-2">
              {llmsTopics.map((topic) => (
                <li key={topic.key}>
                  <Link
                    href={`${issuesPath}${buildQueryString({ category: topic.key })}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-default p-3 transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="text-sm font-semibold text-foreground">{topic.label}</span>
                    <span className="tabular text-xs text-muted">
                      {topic.issueCount.toLocaleString("en-US")} finding{topic.issueCount === 1 ? "" : "s"} ·{" "}
                      {topic.affectedPageCount.toLocaleString("en-US")} affected page
                      {topic.affectedPageCount === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">
            The file itself — its status, its link and its full contents — is shown in the panel directly below. Its
            contents have in fact been stored by every crawl since llms.txt support was built; until Phase 37 nothing
            in this product read them back, which is why this page previously said they were unavailable.
          </p>
        </CardContent>
      </Card>

      {/* ─── 2b. The llms.txt files themselves (Phase 37) ───────────────── */}
      <SiteFilesPanel
        websiteId={site.id}
        title="llms.txt files"
        description="Every llms.txt / llms-full.txt this platform has recorded for the site: its status, a link to it, and the file exactly as the server returned it."
        entries={llmsFileEntries}
        crawlHistoryHref={crawlHistoryHref}
        allowedTypes={["llms_txt"]}
        defaultType="llms_txt"
        labelFor={(entry) => {
          const row = llmsFileEntries.find((candidate) => candidate.id === entry.id);
          return row?.kind === "llms_full_txt" ? "llms-full.txt" : "llms.txt";
        }}
        extraFactsFor={(entry) => {
          const row = llmsFileEntries.find((candidate) => candidate.id === entry.id);
          if (!row) return [];
          const facts: { label: string; value: string }[] = [];
          if (row.title) facts.push({ label: "Declared title", value: row.title });
          if (row.summary) facts.push({ label: "Declared summary", value: row.summary });
          return facts;
        }}
      />

      {/* ─── 3. AI crawler access ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>AI crawler access</CardTitle>
          <CardDescription>
            What this site&apos;s robots.txt says to named AI crawlers such as GPTBot, ClaudeBot, PerplexityBot and
            Google-Extended.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data.hasCompletedCrawl ? (
            <EmptyState
              icon={Bot}
              title="Not assessed"
              description="AI-crawler rules are read from robots.txt during a crawl. No crawl has completed."
              actionLabel="Go to crawl history"
              actionHref={crawlHistoryHref}
            />
          ) : !crawlerTopic ? (
            <p className="text-sm text-secondary-foreground">
              No AI-crawler restriction was recorded in the most recent completed crawl — this site&apos;s robots.txt
              neither fully nor partially blocks any of the AI crawlers this platform knows about.
            </p>
          ) : (
            <>
              <Link
                href={`${issuesPath}${buildQueryString({ category: "ai_crawler_access" })}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-default p-3 transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="text-sm font-semibold text-foreground">{crawlerTopic.label}</span>
                <span className="tabular text-xs text-muted">
                  {crawlerTopic.issueCount.toLocaleString("en-US")} finding
                  {crawlerTopic.issueCount === 1 ? "" : "s"}
                </span>
              </Link>
              <p className="text-xs text-muted">
                These findings are recorded as <strong>informational</strong>, never as defects. Blocking an AI crawler
                is very often a deliberate policy decision, and this report will not tell you it is a mistake — it
                tells you what the file currently says so you can confirm it is what you intended.
              </p>
            </>
          )}
          <p className="text-xs text-muted">
            The same robots.txt verdicts also appear on the{" "}
            <Link
              href={`/websites/${site.id}/robots`}
              className="rounded-sm font-medium text-accent hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Robots.txt report
            </Link>
            , which owns the file itself. Nothing was moved or duplicated — one finding, read by both reports.
          </p>
        </CardContent>
      </Card>

      {/* ─── 4. Per-page readiness, incl. the AI-inferred assessment ───── */}
      <Card>
        <CardHeader>
          <CardTitle>Readiness by page</CardTitle>
          <CardDescription>
            Every assessed page, weakest AI Overview readiness first. Expand a page for the individual signals measured
            on it, and to run the AI-inferred assessment of the dimensions this platform does not score
            deterministically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pageRows.length === 0 ? (
            <EmptyState
              icon={ScanSearch}
              title="No pages assessed"
              description="Per-page readiness is only known after a crawl has completed."
              actionLabel="Go to crawl history"
              actionHref={crawlHistoryHref}
            />
          ) : (
            <AiPageReadinessList pages={pageRows} />
          )}
        </CardContent>
      </Card>

      {/* ─── 5. The rule findings ──────────────────────────────────────── */}
      <ModuleSeverityKpis
        countsBySeverity={data.countsBySeverity}
        totalIssueTypes={data.totalIssueTypes}
        totalAffectedPageInstances={data.totalAffectedPageInstances}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="AI search findings"
        description="AEO, GEO, llms.txt and AI-crawler rules from the most recent completed crawl, counted as distinct rule types. Most are informational opportunities rather than defects — see the Issues tab for each one's severity."
        extraFooterItems={
          data.hasCompletedCrawl
            ? [{ label: "Pages scanned", value: data.report.pagesScanned.toLocaleString("en-US") }]
            : undefined
        }
      />

      <ModuleTopicGrid
        topics={data.topics}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="By AI search area"
        description="Every area with at least one finding, linking into the pre-filtered issue list. An area with no findings is not listed — an absent area is not a measured zero."
      />

      <ModuleTopIssues
        issues={previewIssues}
        totalIssueTypes={data.totalIssueTypes}
        issuesPath={issuesPath}
        crawlHistoryHref={crawlHistoryHref}
        hasCompletedCrawl={data.hasCompletedCrawl}
        emptyDescription="The most recent completed crawl found no AEO, GEO, llms.txt or AI-crawler findings on this site."
      />
    </div>
  );
}
