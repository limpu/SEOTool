/**
 * Phase 23 — DB-aware recommendation computation. Like Phase 22's scoring,
 * this is computed LIVE on request, not cached and not persisted to a new
 * table: it is a simple indexed select (`seo_issues` joined to `seo_rules`)
 * plus in-memory grouping/sorting (`buildRecommendations`) — nothing like
 * Phase 20's expensive out-of-process Lighthouse runs, so there's no
 * performance reason to cache and every reason to avoid a staleness problem.
 *
 * A pre-scaffolded `recommendations` table already exists in the schema
 * (one row per `issue_id`, with `priority`/`steps`/`expected_impact`
 * columns) but its shape doesn't fit this phase's actual output — it is
 * keyed per individual issue instance, not per distinct rule aggregated
 * across pages, and has no room for "dismissed/won't-fix" state either.
 * Per the task's explicit scoping instruction not to add speculative
 * state-tracking (the master doc's Phase 23 section doesn't call for
 * dismissal tracking), this phase leaves that table untouched and unused —
 * same precedent as Phase 20 leaving the ill-fitting pre-scaffolded
 * `page_metrics` table alone in favor of a purpose-built new one, except
 * here no new table is needed at all since nothing is being persisted.
 */

import { db } from "@/lib/db";
import { pages, seoIssues, seoRules, crawlRuns } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { buildRecommendations, type TieredRecommendations } from "./prioritize";

async function recommendationsForPageIds(pageIds: string[]): Promise<TieredRecommendations> {
  if (pageIds.length === 0) {
    return buildRecommendations([], []);
  }

  const rows = await db
    .select({
      ruleKey: seoRules.ruleKey,
      category: seoRules.category,
      severity: seoRules.severity,
      title: seoRules.title,
      description: seoRules.description,
      recommendation: seoRules.recommendation,
      fixExample: seoRules.fixExample,
      impact: seoRules.impact,
      pageId: seoIssues.pageId,
      pageUrl: pages.url,
      evidence: seoIssues.evidence,
    })
    .from(seoIssues)
    .innerJoin(seoRules, eq(seoIssues.ruleId, seoRules.id))
    .innerJoin(pages, eq(seoIssues.pageId, pages.id))
    .where(inArray(seoIssues.pageId, pageIds));

  const rulesByKey = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!rulesByKey.has(row.ruleKey)) rulesByKey.set(row.ruleKey, row);
  }

  return buildRecommendations(
    Array.from(rulesByKey.values()).map((r) => ({
      ruleKey: r.ruleKey,
      category: r.category,
      severity: r.severity,
      title: r.title,
      description: r.description,
      recommendation: r.recommendation,
      fixExample: r.fixExample,
      impact: r.impact,
    })),
    rows.map((r) => ({
      ruleKey: r.ruleKey,
      pageId: r.pageId,
      pageUrl: r.pageUrl,
      evidence: r.evidence,
    })),
  );
}

/** Recommendations for a single page's own issues. */
export async function computePageRecommendations(pageId: string): Promise<TieredRecommendations> {
  return recommendationsForPageIds([pageId]);
}

/** Recommendations aggregated across every page in one crawl run. */
export async function computeCrawlRunRecommendations(crawlRunId: string): Promise<TieredRecommendations> {
  const pageRows = await db.select({ id: pages.id }).from(pages).where(eq(pages.crawlRunId, crawlRunId));
  return recommendationsForPageIds(pageRows.map((p) => p.id));
}

/**
 * Website-level recommendations: aggregated across the website's MOST
 * RECENT completed crawl run only — same "don't double-count across repeat
 * crawls" reasoning Phase 22's `computeWebsiteScores` already documents and
 * applies (old crawl runs' `pages` rows are never deleted).
 */
export async function computeWebsiteRecommendations(websiteId: string): Promise<TieredRecommendations> {
  const [latestRun] = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(1);

  if (!latestRun) {
    return buildRecommendations([], []);
  }

  return computeCrawlRunRecommendations(latestRun.id);
}
