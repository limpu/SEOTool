import { db } from "@/lib/db";
import { crawlRuns, pages, schemas, seoIssues, websites } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { buildStructuralComparison, type SiteStructuralSnapshot, type StructuralComparisonResult } from "./compare";
import { computeWebsiteScores, type ScoreResult } from "@/lib/scoring/compute";
import { computeWebsiteAiSearch } from "@/lib/ai-search/compute";

/**
 * Builds a structural snapshot for one website (owned or competitor — this
 * table doesn't distinguish for query purposes) from its most recent
 * COMPLETED crawl run, mirroring Phase 22's `computeWebsiteScores` "most
 * recent completed run only" precedent (old crawl runs' pages are never
 * deleted, so summing across all of them would double-count repeat crawls).
 */
async function buildSnapshot(websiteId: string, label: string): Promise<SiteStructuralSnapshot> {
  const [latestRun] = await db
    .select({ id: crawlRuns.id, completedAt: crawlRuns.completedAt })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(1);

  if (!latestRun) {
    return {
      websiteId,
      label,
      crawledAt: null,
      pageCount: 0,
      avgWordCount: null,
      avgHeadingCount: null,
      ruleKeys: [],
      schemaTypes: [],
    };
  }

  const crawledPages = await db
    .select({ id: pages.id, wordCount: pages.wordCount, headingsJson: pages.headingsJson })
    .from(pages)
    .where(eq(pages.crawlRunId, latestRun.id));

  const pageIds = crawledPages.map((p) => p.id);

  const wordCounts = crawledPages.map((p) => p.wordCount).filter((n): n is number => typeof n === "number");
  const avgWordCount = wordCounts.length > 0 ? Math.round(wordCounts.reduce((s, n) => s + n, 0) / wordCounts.length) : null;

  const headingCounts = crawledPages
    .map((p) => (Array.isArray(p.headingsJson) ? p.headingsJson.length : null))
    .filter((n): n is number => typeof n === "number");
  const avgHeadingCount =
    headingCounts.length > 0 ? Math.round((headingCounts.reduce((s, n) => s + n, 0) / headingCounts.length) * 10) / 10 : null;

  const issueRows =
    pageIds.length === 0
      ? []
      : await db.select({ ruleId: seoIssues.ruleId, category: seoIssues.category, title: seoIssues.title }).from(seoIssues).where(inArray(seoIssues.pageId, pageIds));

  // `seoIssues` doesn't carry `ruleKey` directly (only `ruleId`), but every
  // rule's `title` is unique per rule (Phase 7's Rule Model) and is already
  // selected everywhere else in this codebase as the human-facing identity
  // of a rule (e.g. Phase 23's recommendation entries). Using `title` here
  // avoids an extra join to `seo_rules` for what is purely a
  // presence/absence set-diff, not a rule-metadata lookup.
  const ruleKeys = [...new Set(issueRows.map((r) => r.title))];

  const schemaRows =
    pageIds.length === 0
      ? []
      : await db.select({ schemaType: schemas.schemaType }).from(schemas).where(inArray(schemas.pageId, pageIds));
  const schemaTypes = [...new Set(schemaRows.map((s) => s.schemaType).filter((t): t is string => !!t))];

  return {
    websiteId,
    label,
    crawledAt: latestRun.completedAt ? latestRun.completedAt.toISOString() : null,
    pageCount: crawledPages.length,
    avgWordCount,
    avgHeadingCount,
    ruleKeys,
    schemaTypes,
  };
}

export interface CompetitorComparisonResult {
  structural: StructuralComparisonResult;
  yourScores: ScoreResult;
  competitorScores: ScoreResult;
  yourAiSearchOverall: { geo: number | null; aeo: number | null; aio: number | null };
  competitorAiSearchOverall: { geo: number | null; aeo: number | null; aio: number | null };
}

/**
 * Full comparison for one (owned website, competitor) pair: structural
 * snapshot diff + Phase 22 scores + Phase 24 AI-search readiness, for both
 * sides — every number sourced from a real crawl of each site, never
 * fabricated. If either side has no completed crawl yet, its snapshot is
 * all-zero/null (never a guessed placeholder) and the caller should
 * surface that honestly rather than rendering a misleading comparison.
 */
export async function computeCompetitorComparison(
  websiteId: string,
  websiteName: string,
  competitorId: string,
  competitorName: string
): Promise<CompetitorComparisonResult> {
  const [yourSnapshot, competitorSnapshot, yourScores, competitorScores, yourAiSearch, competitorAiSearch] = await Promise.all([
    buildSnapshot(websiteId, websiteName),
    buildSnapshot(competitorId, competitorName),
    computeWebsiteScores(websiteId),
    computeWebsiteScores(competitorId),
    computeWebsiteAiSearch(websiteId),
    computeWebsiteAiSearch(competitorId),
  ]);

  return {
    structural: buildStructuralComparison(yourSnapshot, competitorSnapshot),
    yourScores,
    competitorScores,
    yourAiSearchOverall: {
      geo: yourAiSearch.geo,
      aeo: yourAiSearch.aeo,
      aio: yourAiSearch.aio,
    },
    competitorAiSearchOverall: {
      geo: competitorAiSearch.geo,
      aeo: competitorAiSearch.aeo,
      aio: competitorAiSearch.aio,
    },
  };
}

export { websites };
