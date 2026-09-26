/**
 * Phase 22 — DB-aware score computation. Live-computed (not cached), per
 * read.md's documented decision: aggregating already-persisted `seo_issues`
 * rows and already-persisted `pagespeed_audits` category scores is cheap
 * (simple indexed selects + in-memory arithmetic) — nothing like Phase 20's
 * expensive Lighthouse runs. Nothing here justifies a new cached table or a
 * "compute at end of crawl" step; a page/site's score is always exactly a
 * function of its current `seo_issues` + latest `pagespeed_audits` rows and
 * should never go stale between crawls.
 */

import { db } from "@/lib/db";
import { pages, seoIssues, pagespeedAudits, crawlRuns } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  computeCategoryScore,
  computeOverallScore,
  computePerformanceScore,
  type CategoryScoreBreakdown,
  type Severity,
} from "./formula";

export interface ScoreResult {
  technical: CategoryScoreBreakdown;
  onPage: CategoryScoreBreakdown;
  performance: { score: number | null; strategiesMeasured: string[] };
  overall: { score: number | null; weights: { technical: number; onPage: number; performance: number } };
}

type IssueRow = { category: string; severity: Severity };

function splitByCategory(issues: IssueRow[]) {
  const technical = issues.filter((i) => i.category === "technical" || i.category === "schema");
  const onPage = issues.filter((i) => i.category === "on_page");
  return { technical, onPage };
}

function buildResult(issues: IssueRow[], performanceScore: number | null, strategiesMeasured: string[]): ScoreResult {
  const { technical, onPage } = splitByCategory(issues);
  const technicalScore = computeCategoryScore(technical);
  const onPageScore = computeCategoryScore(onPage);
  const overall = computeOverallScore({
    technical: technicalScore.score,
    onPage: onPageScore.score,
    performance: performanceScore,
  });

  return {
    technical: technicalScore,
    onPage: onPageScore,
    performance: { score: performanceScore, strategiesMeasured },
    overall,
  };
}

/** Latest completed PageSpeed performance-category score(s) for a URL. */
async function getLatestPerformanceScoreForUrl(websiteId: string, url: string) {
  const rows = await db
    .select({
      strategy: pagespeedAudits.strategy,
      performanceScore: pagespeedAudits.performanceScore,
      createdAt: pagespeedAudits.createdAt,
    })
    .from(pagespeedAudits)
    .where(and(eq(pagespeedAudits.websiteId, websiteId), eq(pagespeedAudits.url, url), eq(pagespeedAudits.status, "completed")));

  const latestByStrategy = new Map<string, { performanceScore: number | null; createdAt: Date }>();
  for (const row of rows) {
    const existing = latestByStrategy.get(row.strategy);
    if (!existing || row.createdAt > existing.createdAt) {
      latestByStrategy.set(row.strategy, { performanceScore: row.performanceScore, createdAt: row.createdAt });
    }
  }

  const strategiesMeasured = Array.from(latestByStrategy.keys());
  const score = computePerformanceScore(Array.from(latestByStrategy.values()).map((v) => v.performanceScore));
  return { score, strategiesMeasured };
}

/** Latest completed PageSpeed performance-category score(s), any URL on the website. */
async function getLatestPerformanceScoreForWebsite(websiteId: string) {
  const rows = await db
    .select({
      strategy: pagespeedAudits.strategy,
      url: pagespeedAudits.url,
      performanceScore: pagespeedAudits.performanceScore,
      createdAt: pagespeedAudits.createdAt,
    })
    .from(pagespeedAudits)
    .where(and(eq(pagespeedAudits.websiteId, websiteId), eq(pagespeedAudits.status, "completed")));

  // Latest audit per (url, strategy), then averaged across everything found —
  // gives a site-level performance signal from whatever pages/strategies
  // have actually been audited, without double-counting stale re-runs.
  const latestByKey = new Map<string, { performanceScore: number | null; createdAt: Date }>();
  for (const row of rows) {
    const key = `${row.url}::${row.strategy}`;
    const existing = latestByKey.get(key);
    if (!existing || row.createdAt > existing.createdAt) {
      latestByKey.set(key, { performanceScore: row.performanceScore, createdAt: row.createdAt });
    }
  }

  const strategiesMeasured = Array.from(new Set(rows.map((r) => r.strategy)));
  const score = computePerformanceScore(Array.from(latestByKey.values()).map((v) => v.performanceScore));
  return { score, strategiesMeasured };
}

/** Page-level scores: issues for this page + Lighthouse data for this page's URL. */
export async function computePageScores(pageId: string): Promise<ScoreResult> {
  const [page] = await db.select({ id: pages.id, url: pages.url, websiteId: pages.websiteId }).from(pages).where(eq(pages.id, pageId)).limit(1);
  if (!page) {
    throw new Error("Page not found.");
  }

  const issues = await db
    .select({ category: seoIssues.category, severity: seoIssues.severity })
    .from(seoIssues)
    .where(eq(seoIssues.pageId, pageId));

  const { score: performanceScore, strategiesMeasured } = await getLatestPerformanceScoreForUrl(page.websiteId, page.url);

  return buildResult(issues, performanceScore, strategiesMeasured);
}

/** Crawl-run-level scores: aggregate issues across every page in the run + site-level Lighthouse data. */
export async function computeCrawlRunScores(crawlRunId: string, websiteId: string): Promise<ScoreResult> {
  const pageRows = await db.select({ id: pages.id }).from(pages).where(eq(pages.crawlRunId, crawlRunId));
  const pageIds = pageRows.map((p) => p.id);

  const issues =
    pageIds.length === 0
      ? []
      : await db
          .select({ category: seoIssues.category, severity: seoIssues.severity })
          .from(seoIssues)
          .where(inArray(seoIssues.pageId, pageIds));

  const { score: performanceScore, strategiesMeasured } = await getLatestPerformanceScoreForWebsite(websiteId);

  return buildResult(issues, performanceScore, strategiesMeasured);
}

/**
 * Website-level scores: aggregate issues from the website's MOST RECENT
 * crawl run only (not every page row ever crawled — old crawl runs' pages
 * are never deleted, since each crawl creates a fresh `crawlRunId`-scoped
 * set, so summing across all of them would double-count issues across
 * repeat crawls of the same URLs) + site-level Lighthouse data.
 */
export async function computeWebsiteScores(websiteId: string): Promise<ScoreResult> {
  const [latestRun] = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(1);

  if (!latestRun) {
    const { score: performanceScore, strategiesMeasured } = await getLatestPerformanceScoreForWebsite(websiteId);
    return buildResult([], performanceScore, strategiesMeasured);
  }

  return computeCrawlRunScores(latestRun.id, websiteId);
}
