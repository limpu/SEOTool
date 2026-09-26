/**
 * Phase 30 — Reports: JSON data assembly.
 *
 * This is deliberately "call all the existing compute functions and
 * assemble the result" — per read.md's Phase 22-29 write-ups, every input a
 * report needs (scores, recommendations, GEO/AEO/AIO readiness, E-E-A-T,
 * PageSpeed, GSC, tracked keywords, competitor comparison, AI-inferred
 * assessments) already has a dedicated, tested, live-computed function.
 * Nothing here re-derives an aggregation a prior phase already owns.
 *
 * Report generation is SYNCHRONOUS, not the async pending/running/
 * completed/failed job pattern Phase 20 (PageSpeed)/Phase 26 (GSC sync)/
 * Phase 29 (AI) use. Those are async because they perform a genuinely
 * expensive OUT-OF-PROCESS operation (a real Lighthouse/Chrome run, a real
 * network call to Google, a real local-model inference call). A report is
 * pure in-process data assembly over rows this platform already persisted —
 * a handful of indexed selects plus in-memory grouping/templating, the same
 * cost profile Phase 22/23/24/25/28's own `compute.ts` modules already have
 * and which those phases documented as cheap enough to compute live on every
 * request. There is nothing to poll for.
 *
 * Every section is honest about its own availability per Section 79 #3/#5:
 * a section that requires data this website doesn't have yet (no completed
 * crawl, no PageSpeed audit, no GSC connection, no competitor registered)
 * is included with an explicit `available: false` + `reason`, never omitted
 * silently (which could be misread as "not applicable") and never
 * back-filled with a fabricated value.
 */

import { db } from "@/lib/db";
import { crawlRuns, pages, seoIssues, aiPageAssessments, aiContentGapAnalyses, websites } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Website } from "@/lib/websites/queries";
import { listCompetitorsForWebsite } from "@/lib/websites/queries";
import { computeWebsiteScores, type ScoreResult } from "@/lib/scoring/compute";
import { computeWebsiteRecommendations } from "@/lib/recommendations/compute";
import type { TieredRecommendations } from "@/lib/recommendations/prioritize";
import { computeWebsiteAiSearch, type WebsiteAiSearchResult } from "@/lib/ai-search/compute";
import { computeWebsiteEeat, type WebsiteEeatResult } from "@/lib/eeat/compute";
import { listPageSpeedBatches } from "@/lib/pagespeed/run-audit";
import { getGscConnection, getLatestGscMetrics } from "@/lib/gsc/queries";
import { listTrackedKeywords, listRankChecks, findGscQueryMatch } from "@/lib/serp/queries";
import { computeCompetitorComparison, type CompetitorComparisonResult } from "@/lib/competitor/queries";
import { resolveDefaultRunPair, getCompletedCrawlRunForWebsite, computeRetestComparison, type RetestComparisonResult } from "@/lib/retest/queries";

// ─── Issue counts by category/severity (small, report-specific aggregation
// not already exposed by any prior phase's compute module) ────────────────

export interface IssueCountBreakdown {
  totalIssues: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
}

async function computeIssueCounts(crawlRunId: string | null): Promise<IssueCountBreakdown> {
  const empty: IssueCountBreakdown = { totalIssues: 0, byCategory: {}, bySeverity: {} };
  if (!crawlRunId) return empty;

  const pageRows = await db.select({ id: pages.id }).from(pages).where(eq(pages.crawlRunId, crawlRunId));
  const pageIds = pageRows.map((p) => p.id);
  if (pageIds.length === 0) return empty;

  const rows = await db
    .select({ category: seoIssues.category, severity: seoIssues.severity })
    .from(seoIssues)
    .where(inArray(seoIssues.pageId, pageIds));

  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const row of rows) {
    byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
  }

  return { totalIssues: rows.length, byCategory, bySeverity };
}

async function getLatestCompletedCrawlRun(websiteId: string) {
  const [run] = await db
    .select()
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(1);
  return run ?? null;
}

// ─── PageSpeed section (Phase 20/21) ───────────────────────────────────────

export interface PageSpeedReportSection {
  available: boolean;
  reason?: string;
  latestBatch?: {
    batchId: string;
    createdAt: string;
    audits: {
      url: string;
      strategy: string;
      status: string;
      performanceScore: number | null;
      accessibilityScore: number | null;
      bestPracticesScore: number | null;
      seoScore: number | null;
      lcp: number | null;
      cls: number | null;
      inp: number | null;
      fcp: number | null;
      tbt: number | null;
      speedIndex: number | null;
      ttfb: number | null;
    }[];
  };
}

async function buildPageSpeedSection(websiteId: string): Promise<PageSpeedReportSection> {
  const batches = await listPageSpeedBatches(websiteId, 1);
  const latest = batches[0];
  if (!latest) {
    return { available: false, reason: "No PageSpeed (Lighthouse) audit has been run for this website yet." };
  }
  return {
    available: true,
    latestBatch: {
      batchId: latest.batchId,
      createdAt: latest.createdAt.toISOString(),
      audits: latest.audits.map((a) => ({
        url: a.url,
        strategy: a.strategy,
        status: a.status,
        performanceScore: a.performanceScore,
        accessibilityScore: a.accessibilityScore,
        bestPracticesScore: a.bestPracticesScore,
        seoScore: a.seoScore,
        lcp: a.lcp,
        cls: a.cls,
        inp: a.inp,
        fcp: a.fcp,
        tbt: a.tbt,
        speedIndex: a.speedIndex,
        ttfb: a.ttfb,
      })),
    },
  };
}

// ─── GSC section (Phase 26) ────────────────────────────────────────────────

export interface GscReportSection {
  configured: boolean;
  connected: boolean;
  hasSyncedData: boolean;
  reason?: string;
  propertyUrl?: string | null;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  topQueries?: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  topPages?: { page: string; clicks: number; impressions: number; ctr: number; position: number }[];
}

async function buildGscSection(websiteId: string): Promise<GscReportSection> {
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!configured) {
    return { configured: false, connected: false, hasSyncedData: false, reason: "Google Search Console integration is not configured on this server." };
  }

  const connection = await getGscConnection(websiteId);
  if (!connection || !connection.propertyUrl) {
    return { configured: true, connected: false, hasSyncedData: false, reason: "Google Search Console is not connected for this website." };
  }

  const data = await getLatestGscMetrics(websiteId);
  if (!data.syncId) {
    return {
      configured: true,
      connected: true,
      hasSyncedData: false,
      reason: "Search Console is connected but has not been synced yet.",
      propertyUrl: connection.propertyUrl,
    };
  }

  return {
    configured: true,
    connected: true,
    hasSyncedData: true,
    propertyUrl: connection.propertyUrl,
    dateRangeStart: data.dateRangeStart,
    dateRangeEnd: data.dateRangeEnd,
    topQueries: data.queries.slice(0, 25).map((q) => ({
      query: q.dimensionValue,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.ctr,
      position: q.position,
    })),
    topPages: data.pages.slice(0, 25).map((p) => ({
      page: p.dimensionValue,
      clicks: p.clicks,
      impressions: p.impressions,
      ctr: p.ctr,
      position: p.position,
    })),
  };
}

// ─── Tracked keywords section (Phase 27) ───────────────────────────────────

export interface KeywordReportRow {
  keyword: string;
  targetUrl: string | null;
  country: string | null;
  latestManualPosition: number | null;
  latestManualCheckDate: string | null;
  gscPosition: number | null;
  gscClicks: number | null;
  gscSource: "manual" | "gsc" | "none";
}

export interface KeywordsReportSection {
  count: number;
  keywords: KeywordReportRow[];
}

async function buildKeywordsSection(websiteId: string): Promise<KeywordsReportSection> {
  const tracked = await listTrackedKeywords(websiteId);
  if (tracked.length === 0) return { count: 0, keywords: [] };

  // Phase 33 — Performance Optimization: this used to call
  // `matchKeywordToGsc(websiteId, kw.keyword)` inside the loop below, which
  // re-fetched and re-filtered EVERY `gsc_metrics` row for the website (an
  // unfiltered-by-syncId select) once per tracked keyword — a genuine N+1
  // (see read.md's Phase 33 write-up for the measured before/after). GSC
  // metrics don't vary per keyword, so fetch them once and reuse the same
  // already-factored-out pure `findGscQueryMatch()` join per keyword.
  // `listRankChecks` genuinely is one distinct query per keyword (different
  // `trackedKeywordId` each time) — batched here with `Promise.all` so the
  // independent per-keyword queries run concurrently instead of serially.
  const gscData = await getLatestGscMetrics(websiteId);
  const rankChecksByKeyword = await Promise.all(tracked.map((kw) => listRankChecks(kw.id)));

  const keywords: KeywordReportRow[] = tracked.map((kw, i) => {
    const checks = rankChecksByKeyword[i];
    const latest = checks.length > 0 ? checks[checks.length - 1] : null;
    const gscMatch = gscData.syncId
      ? findGscQueryMatch(gscData.queries, kw.keyword, gscData.dateRangeStart as string, gscData.dateRangeEnd as string)
      : null;

    return {
      keyword: kw.keyword,
      targetUrl: kw.targetUrl,
      country: kw.country,
      latestManualPosition: latest?.position ?? null,
      latestManualCheckDate: latest?.checkedDate ?? null,
      gscPosition: gscMatch?.position ?? null,
      gscClicks: gscMatch?.clicks ?? null,
      gscSource: gscMatch ? ("gsc" as const) : latest ? ("manual" as const) : ("none" as const),
    };
  });

  return { count: keywords.length, keywords };
}

// ─── Competitor section (Phase 28) ─────────────────────────────────────────

export interface CompetitorReportEntry {
  competitorId: string;
  competitorName: string;
  competitorUrl: string;
  comparison: CompetitorComparisonResult;
}

export interface CompetitorsReportSection {
  count: number;
  competitors: CompetitorReportEntry[];
}

async function buildCompetitorsSection(website: Website): Promise<CompetitorsReportSection> {
  const competitors = await listCompetitorsForWebsite(website.userId, website.id);

  // Phase 33 — Performance Optimization: each competitor's comparison is
  // fully independent of every other competitor's (each reads its own
  // crawl/issue rows) — awaiting them one at a time in a loop serialized
  // work that could run concurrently. `Promise.all` changes nothing about
  // the result (order preserved, same data per entry), only how the
  // underlying awaits are scheduled.
  const comparisons = await Promise.all(
    competitors.map((competitor) =>
      computeCompetitorComparison(website.id, website.name, competitor.id, competitor.name)
    )
  );
  const entries: CompetitorReportEntry[] = competitors.map((competitor, i) => ({
    competitorId: competitor.id,
    competitorName: competitor.name,
    competitorUrl: competitor.url,
    comparison: comparisons[i],
  }));

  return { count: entries.length, competitors: entries };
}

// ─── AI-inferred section (Phase 29) — always physically separate from every
// deterministic section above, and every row stamped source: "ai_inferred" ─

export interface AiPageAssessmentReportRow {
  source: "ai_inferred";
  pageUrl: string;
  provider: string | null;
  model: string | null;
  answerability: { score: number | null; confidence: number | null; explanation: string } | null;
  semanticCompleteness: { score: number | null; confidence: number | null; explanation: string } | null;
  directAnswers: { score: number | null; confidence: number | null; explanation: string } | null;
  answerCompleteness: { score: number | null; confidence: number | null; explanation: string } | null;
}

export interface AiContentGapReportRow {
  source: "ai_inferred";
  competitorName: string;
  yourUrl: string | null;
  competitorUrl: string | null;
  summary: string | null;
  gaps: { topic: string; description: string; evidence: string }[];
}

export interface AiInferredReportSection {
  disclaimer: string;
  pageAssessments: AiPageAssessmentReportRow[];
  contentGapAnalyses: AiContentGapReportRow[];
}

async function buildAiInferredSection(website: Website, crawlRunId: string | null): Promise<AiInferredReportSection> {
  const disclaimer =
    "The rows in this section are AI-inferred judgments produced by a locally-run language model (Phase 29), not deterministic measurements. They are never blended with the deterministic findings elsewhere in this report and must not be treated as verified facts.";

  const pageAssessments: AiPageAssessmentReportRow[] = [];
  if (crawlRunId) {
    const pageRows = await db.select({ id: pages.id, url: pages.url }).from(pages).where(eq(pages.crawlRunId, crawlRunId));
    const pageIds = pageRows.map((p) => p.id);
    if (pageIds.length > 0) {
      const rows = await db
        .select()
        .from(aiPageAssessments)
        .where(and(inArray(aiPageAssessments.pageId, pageIds), eq(aiPageAssessments.status, "completed")))
        .orderBy(desc(aiPageAssessments.completedAt));

      const seenPages = new Set<string>();
      const urlByPageId = new Map(pageRows.map((p) => [p.id, p.url]));
      for (const row of rows) {
        if (seenPages.has(row.pageId)) continue; // latest completed assessment per page only
        seenPages.add(row.pageId);
        pageAssessments.push({
          source: "ai_inferred",
          pageUrl: urlByPageId.get(row.pageId) ?? "(unknown page)",
          provider: row.provider,
          model: row.model,
          answerability: row.answerability,
          semanticCompleteness: row.semanticCompleteness,
          directAnswers: row.directAnswers,
          answerCompleteness: row.answerCompleteness,
        });
      }
    }
  }

  const gapRows = await db
    .select()
    .from(aiContentGapAnalyses)
    .where(and(eq(aiContentGapAnalyses.websiteId, website.id), eq(aiContentGapAnalyses.status, "completed")))
    .orderBy(desc(aiContentGapAnalyses.completedAt));

  const seenCompetitors = new Set<string>();
  const dedupedGapRows = gapRows.filter((row) => {
    if (seenCompetitors.has(row.competitorId)) return false; // latest completed analysis per competitor only
    seenCompetitors.add(row.competitorId);
    return true;
  });

  // Phase 33 — Performance Optimization: this used to fire one
  // `SELECT ... FROM websites WHERE id = ...` per distinct competitor inside
  // the loop — a classic N+1 (N = number of competitors this website has
  // AI content-gap analyses for). Batched into a single `inArray` select.
  const competitorIds = dedupedGapRows.map((row) => row.competitorId);
  const competitorRows =
    competitorIds.length === 0 ? [] : await db.select().from(websites).where(inArray(websites.id, competitorIds));
  const competitorNameById = new Map(competitorRows.map((c) => [c.id, c.name]));

  const contentGapAnalyses: AiContentGapReportRow[] = dedupedGapRows.map((row) => ({
    source: "ai_inferred",
    competitorName: competitorNameById.get(row.competitorId) ?? "(unknown competitor)",
    yourUrl: row.yourUrl,
    competitorUrl: row.competitorUrl,
    summary: row.summary,
    gaps: row.gaps ?? [],
  }));

  return { disclaimer, pageAssessments, contentGapAnalyses };
}

// ─── Optional Before/After section (Phase 31) ──────────────────────────────
// A clean, low-effort extension of this already-shipped assembly function —
// reuses `resolveDefaultRunPair`/`computeRetestComparison` verbatim (no new
// comparison logic here). Only included when the website actually has 2+
// completed crawl runs; otherwise `available: false` with an honest reason,
// same pattern as every other optional section above (pagespeed/gsc), never
// silently omitted and never a fabricated comparison against nothing.

export interface RetestReportSection {
  available: boolean;
  reason?: string;
  comparison?: RetestComparisonResult;
}

async function buildRetestSection(websiteId: string): Promise<RetestReportSection> {
  const pair = await resolveDefaultRunPair(websiteId);
  if (!pair) {
    return { available: false, reason: "Re-test comparison requires at least 2 completed crawls — run another crawl to compare against this baseline." };
  }
  const [baseline, current] = await Promise.all([
    getCompletedCrawlRunForWebsite(websiteId, pair.baselineCrawlRunId),
    getCompletedCrawlRunForWebsite(websiteId, pair.currentCrawlRunId),
  ]);
  if (!baseline || !current) {
    return { available: false, reason: "Re-test comparison requires at least 2 completed crawls — run another crawl to compare against this baseline." };
  }
  const comparison = await computeRetestComparison(websiteId, baseline, current);
  return { available: true, comparison };
}

// ─── Full report assembly ──────────────────────────────────────────────────

export interface WebsiteReport {
  generatedAt: string;
  website: { id: string; name: string; domain: string; url: string };
  crawl: { hasCompletedCrawl: boolean; crawlRunId: string | null; completedAt: string | null; pagesCrawled: number | null };
  scores: ScoreResult;
  issueCounts: IssueCountBreakdown;
  recommendations: TieredRecommendations;
  aiSearch: WebsiteAiSearchResult;
  eeat: WebsiteEeatResult;
  pagespeed: PageSpeedReportSection;
  gsc: GscReportSection;
  keywords: KeywordsReportSection;
  competitors: CompetitorsReportSection;
  aiInferred: AiInferredReportSection;
  retest: RetestReportSection;
  disclaimers: {
    scores: string;
    recommendations: string;
    aiSearch: string;
    eeat: string;
  };
}

/**
 * Assembles the full report data structure for one website. Every section
 * reuses an existing Phase 22-29 compute function verbatim (see file header)
 * except the small report-specific issue-count breakdown above, which no
 * prior phase's API already exposed in this exact shape.
 */
export async function assembleWebsiteReport(website: Website): Promise<WebsiteReport> {
  const latestRun = await getLatestCompletedCrawlRun(website.id);

  const [scores, issueCounts, recommendations, aiSearch, eeat, pagespeed, gsc, keywords, competitors, aiInferred, retest] = await Promise.all([
    computeWebsiteScores(website.id),
    computeIssueCounts(latestRun?.id ?? null),
    computeWebsiteRecommendations(website.id),
    computeWebsiteAiSearch(website.id),
    computeWebsiteEeat(website.id),
    buildPageSpeedSection(website.id),
    buildGscSection(website.id),
    buildKeywordsSection(website.id),
    buildCompetitorsSection(website),
    buildAiInferredSection(website, latestRun?.id ?? null),
    buildRetestSection(website.id),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    website: { id: website.id, name: website.name, domain: website.domain, url: website.url },
    crawl: {
      hasCompletedCrawl: !!latestRun,
      crawlRunId: latestRun?.id ?? null,
      completedAt: latestRun?.completedAt ? latestRun.completedAt.toISOString() : null,
      pagesCrawled: latestRun?.pagesCrawled ?? null,
    },
    scores,
    issueCounts,
    recommendations,
    aiSearch,
    eeat,
    pagespeed,
    gsc,
    keywords,
    competitors,
    aiInferred,
    retest,
    disclaimers: {
      scores:
        "Scores are a proprietary product measure of this platform's own rule engines and Lighthouse output — not an official Google ranking score, and not a guarantee of search-ranking correlation.",
      recommendations:
        "Recommendations describe what is technically wrong and why it matters for crawlability, indexability, or user experience. Implementing a recommendation is not a guarantee of improved search rankings or AI-search visibility.",
      aiSearch:
        "GEO/AEO/AI Overview Readiness are proprietary readiness signals, not official search-engine or AI-provider metrics, and do not guarantee AI Overview/ChatGPT/Perplexity inclusion. Some named dimensions are intentionally left unassessed (see each dimension's 'Not measured' entries).",
      eeat: "This checks for markers commonly associated with Google's public E-E-A-T guidance — it does NOT measure Google's actual internal E-E-A-T ranking signal. About/Contact/Privacy detection is a heuristic over the pages actually crawled, not a guarantee a page doesn't exist elsewhere on the site.",
    },
  };
}
