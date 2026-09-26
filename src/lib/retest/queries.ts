/**
 * Phase 31 — Re-test (Before/After comparison), DB-aware layer.
 *
 * Prerequisite already exists (per read.md Phase 6): `crawl_runs` has no
 * "one row per website" constraint — a website already accumulates one
 * `crawl_runs` row per crawl over time, so before/after comparison needs NO
 * new crawl mechanism at all, only comparison logic across two already-
 * existing, already-completed `crawlRunId`s. No new DB table/migration.
 *
 * Reused verbatim from prior phases (not reinvented):
 *   - `computeCrawlRunScores(crawlRunId, websiteId)` (Phase 22) — called
 *     once per side, exactly as Phase 30's `buildScoreHistoryCsv` already
 *     established the "score computed per historical crawl run" pattern.
 *   - The "most recent completed crawl run(s)" ordering convention every
 *     prior phase's `compute.ts` already uses (Phase 22/23/28).
 */

import { db } from "@/lib/db";
import { crawlRuns, pages, seoIssues, seoRules, pagespeedAudits } from "@/lib/db/schema";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { computeCrawlRunScores, type ScoreResult } from "@/lib/scoring/compute";
import {
  diffScores,
  diffIssueCounts,
  diffRuleKeys,
  diffCoreWebVitals,
  buildIssueCountSnapshot,
  buildRetestVerdict,
  type ScoreDeltas,
  type IssueCountDeltas,
  type RuleKeyDiffResult,
  type CoreWebVitalsDeltas,
  type CoreWebVitalsSnapshot,
  type RuleKeySnapshotEntry,
  type RetestVerdict,
} from "./compare";

export interface CrawlRunSummary {
  id: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
  pagesCrawled: number | null;
}

/** All completed crawl runs for a website, most recent first — used to populate a "pick a baseline/current run" UI and to resolve the default pair. */
export async function listCompletedCrawlRuns(websiteId: string): Promise<CrawlRunSummary[]> {
  const rows = await db
    .select({
      id: crawlRuns.id,
      status: crawlRuns.status,
      completedAt: crawlRuns.completedAt,
      createdAt: crawlRuns.createdAt,
      pagesCrawled: crawlRuns.pagesCrawled,
    })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(desc(crawlRuns.createdAt));

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    pagesCrawled: r.pagesCrawled ?? null,
  }));
}

/** A specific crawl run, confirmed to belong to the given website AND be completed (the two things a re-test comparison requires of each side). */
export async function getCompletedCrawlRunForWebsite(websiteId: string, crawlRunId: string) {
  const [run] = await db
    .select({ id: crawlRuns.id, status: crawlRuns.status, completedAt: crawlRuns.completedAt, createdAt: crawlRuns.createdAt })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.id, crawlRunId), eq(crawlRuns.websiteId, websiteId)))
    .limit(1);
  if (!run || run.status !== "completed") return null;
  return run;
}

/**
 * Default-pair resolution: "most recent completed run" vs. "the completed
 * run before it" when the caller doesn't specify explicit baseline/current
 * `crawlRunId`s. Returns `null` (not an error object) when fewer than 2
 * completed runs exist — the caller decides how to surface that honestly.
 */
export async function resolveDefaultRunPair(websiteId: string): Promise<{ baselineCrawlRunId: string; currentCrawlRunId: string } | null> {
  const runs = await listCompletedCrawlRuns(websiteId);
  if (runs.length < 2) return null;
  return { baselineCrawlRunId: runs[1].id, currentCrawlRunId: runs[0].id };
}

async function pageIdsForCrawlRun(crawlRunId: string): Promise<string[]> {
  const rows = await db.select({ id: pages.id }).from(pages).where(eq(pages.crawlRunId, crawlRunId));
  return rows.map((r) => r.id);
}

interface IssueRow {
  ruleKey: string;
  title: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  pageId: string;
}

async function issuesForCrawlRun(pageIds: string[]): Promise<IssueRow[]> {
  if (pageIds.length === 0) return [];
  return db
    .select({
      ruleKey: seoRules.ruleKey,
      title: seoRules.title,
      // Rule-level category/severity (not the per-issue-row copy) — same
      // "severity is a property of the rule, not the individual violation"
      // convention Phase 23's `recommendations/compute.ts` already applies.
      category: seoRules.category,
      severity: seoRules.severity,
      pageId: seoIssues.pageId,
    })
    .from(seoIssues)
    .innerJoin(seoRules, eq(seoIssues.ruleId, seoRules.id))
    .where(inArray(seoIssues.pageId, pageIds));
}

function buildRuleKeySnapshot(issues: IssueRow[]): RuleKeySnapshotEntry[] {
  // ruleKey -> distinct pageIds (mirrors Phase 23's `buildRecommendations`
  // dedup-per-page pattern so affectedPageCount reflects distinct pages,
  // not raw issue rows).
  const byRule = new Map<string, { title: string; category: string; severity: IssueRow["severity"]; pageIds: Set<string> }>();
  for (const issue of issues) {
    let entry = byRule.get(issue.ruleKey);
    if (!entry) {
      entry = { title: issue.title, category: issue.category, severity: issue.severity, pageIds: new Set() };
      byRule.set(issue.ruleKey, entry);
    }
    entry.pageIds.add(issue.pageId);
  }
  return Array.from(byRule.entries()).map(([ruleKey, e]) => ({
    ruleKey,
    title: e.title,
    category: e.category,
    severity: e.severity,
    affectedPageCount: e.pageIds.size,
  }));
}

/**
 * Best-effort Core Web Vitals snapshot "as of" a crawl run: the latest
 * COMPLETED `pagespeed_audits` row(s) for the website with `completedAt` at
 * or before the crawl run's own `completedAt`, averaged across whichever
 * strategies (mobile/desktop) have such a row. `pagespeed_audits` is not
 * itself scoped to a `crawlRunId` (Phase 20 built it as a website-level,
 * independently-triggered audit, not a per-crawl artifact) — this is the
 * most honest available approximation of "what were Core Web Vitals at the
 * time of this crawl", NOT a guarantee that a PageSpeed audit was run at
 * exactly that moment. If no qualifying audit exists for a side, every
 * field is `null` — never fabricated or backfilled from the other side's
 * data. See read.md's Phase 31 write-up "Known limitations" for the full
 * disclosure of this approximation.
 */
async function coreWebVitalsAsOf(websiteId: string, asOf: Date | null): Promise<CoreWebVitalsSnapshot> {
  if (!asOf) return { lcp: null, cls: null, inp: null, measuredAt: null };

  const rows = await db
    .select({
      strategy: pagespeedAudits.strategy,
      lcp: pagespeedAudits.lcp,
      cls: pagespeedAudits.cls,
      inp: pagespeedAudits.inp,
      completedAt: pagespeedAudits.completedAt,
    })
    .from(pagespeedAudits)
    .where(and(eq(pagespeedAudits.websiteId, websiteId), eq(pagespeedAudits.status, "completed"), lte(pagespeedAudits.completedAt, asOf)));

  const latestByStrategy = new Map<string, { lcp: number | null; cls: number | null; inp: number | null; completedAt: Date }>();
  for (const row of rows) {
    if (!row.completedAt) continue;
    const existing = latestByStrategy.get(row.strategy);
    if (!existing || row.completedAt > existing.completedAt) {
      latestByStrategy.set(row.strategy, { lcp: row.lcp, cls: row.cls, inp: row.inp, completedAt: row.completedAt });
    }
  }

  const measurements = Array.from(latestByStrategy.values());
  if (measurements.length === 0) return { lcp: null, cls: null, inp: null, measuredAt: null };

  const avg = (vals: (number | null)[]) => {
    const valid = vals.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return valid.length === 0 ? null : Math.round((valid.reduce((s, v) => s + v, 0) / valid.length) * 100) / 100;
  };

  const latestCompletedAt = measurements.reduce((max, m) => (m.completedAt > max ? m.completedAt : max), measurements[0].completedAt);

  return {
    lcp: avg(measurements.map((m) => m.lcp)),
    cls: avg(measurements.map((m) => m.cls)),
    inp: avg(measurements.map((m) => m.inp)),
    measuredAt: latestCompletedAt.toISOString(),
  };
}

export interface RetestComparisonResult {
  baselineCrawlRunId: string;
  currentCrawlRunId: string;
  baselineCompletedAt: string | null;
  currentCompletedAt: string | null;
  scores: { before: ScoreResult; after: ScoreResult };
  scoreDeltas: ScoreDeltas;
  issueCountDeltas: IssueCountDeltas;
  ruleKeyDiff: RuleKeyDiffResult;
  coreWebVitalsDeltas: CoreWebVitalsDeltas;
  verdict: RetestVerdict;
}

/**
 * The full Phase 31 comparison for two already-confirmed (same website,
 * both completed) crawl runs. Every number is a real delta between two
 * live-computed snapshots — nothing here is cached, nothing is estimated.
 */
export async function computeRetestComparison(
  websiteId: string,
  baseline: { id: string; completedAt: Date | null },
  current: { id: string; completedAt: Date | null },
): Promise<RetestComparisonResult> {
  const [beforeScores, afterScores, beforePageIds, afterPageIds, beforeCwv, afterCwv] = await Promise.all([
    computeCrawlRunScores(baseline.id, websiteId),
    computeCrawlRunScores(current.id, websiteId),
    pageIdsForCrawlRun(baseline.id),
    pageIdsForCrawlRun(current.id),
    coreWebVitalsAsOf(websiteId, baseline.completedAt),
    coreWebVitalsAsOf(websiteId, current.completedAt),
  ]);

  const [beforeIssues, afterIssues] = await Promise.all([issuesForCrawlRun(beforePageIds), issuesForCrawlRun(afterPageIds)]);

  const scoreDeltas = diffScores(beforeScores, afterScores);
  const issueCountDeltas = diffIssueCounts(
    buildIssueCountSnapshot(beforeIssues.map((i) => ({ severity: i.severity, category: i.category }))),
    buildIssueCountSnapshot(afterIssues.map((i) => ({ severity: i.severity, category: i.category }))),
  );
  const ruleKeyDiff = diffRuleKeys(buildRuleKeySnapshot(beforeIssues), buildRuleKeySnapshot(afterIssues));
  const coreWebVitalsDeltas = diffCoreWebVitals(beforeCwv, afterCwv);
  const verdict = buildRetestVerdict(scoreDeltas, ruleKeyDiff);

  return {
    baselineCrawlRunId: baseline.id,
    currentCrawlRunId: current.id,
    baselineCompletedAt: baseline.completedAt ? baseline.completedAt.toISOString() : null,
    currentCompletedAt: current.completedAt ? current.completedAt.toISOString() : null,
    scores: { before: beforeScores, after: afterScores },
    scoreDeltas,
    issueCountDeltas,
    ruleKeyDiff,
    coreWebVitalsDeltas,
    verdict,
  };
}
