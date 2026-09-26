/**
 * Server-side data assembly for the Site Audit report (Overview / Issues /
 * Issue detail).
 *
 * Every number here comes from an ALREADY-EXISTING compute or query function.
 * This module calls them, reshapes the output into the module-agnostic
 * `ReportIssue` shape the shared report components consume, and applies the
 * honest fallbacks. No `src/lib/` business logic was changed or added for this
 * report, and nothing here invents a metric.
 *
 * Site Audit is the WHOLE-SITE view, so its issue set is
 * `computeWebsiteRecommendations` — the site's every distinct rule violation
 * across every category — rather than `computeWebsiteModuleReport`, which
 * exists to slice that same evidence by rule-key prefix for the five
 * single-module reports. Both read the same `seo_issues`/`seo_rules` rows from
 * the same "most recent completed crawl run"; using the tiered
 * recommendations here means Site Audit is a strict superset of the five
 * module reports rather than a sixth, differently-filtered opinion.
 *
 * The loader is wrapped in React's `cache()` so the shared `layout.tsx` (which
 * needs the header chips and the tab counts) and the page under it (which
 * needs the issues) resolve ONE fetch per request between them, not two.
 */

import { cache } from "react";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { crawlRuns } from "@/lib/db/schema";
import { listCrawlRuns } from "@/lib/crawler/queries";
import { computeWebsiteScores, computeCrawlRunScores } from "@/lib/scoring/compute";
import { computeWebsiteRecommendations, computeCrawlRunRecommendations } from "@/lib/recommendations/compute";
import { diffScores, type ScoreDeltas } from "@/lib/retest/compare";
import { SEVERITY_ORDER, type Severity } from "@/lib/scoring/formula";
import type { AffectedPage } from "@/lib/recommendations/prioritize";
import type { ReportIssue } from "@/components/report/filtering";

/**
 * Display labels for `issue_category` (the DB enum in
 * `src/lib/db/schema/index.ts`). Unknown keys fall back to a humanised form of
 * the key itself rather than being dropped or relabelled — a category added to
 * the enum later must still be filterable, with its real name visible, without
 * a code change here.
 */
const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical",
  on_page: "On-Page",
  performance: "Performance",
  schema: "Schema",
  content: "Content",
  entity: "Entity",
  geo: "GEO",
  aeo: "AEO",
  eeat: "E-E-A-T",
  llm: "LLM",
  citation: "Citations",
  accessibility: "Accessibility",
  security: "Security",
};

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/** One distinct rule violation, aggregated across every page it fires on. */
export interface SiteAuditIssue extends ReportIssue {
  description: string;
  recommendation: string | null;
  fixExample: string | null;
  impact: string | null;
  affectedPages: AffectedPage[];
}

export interface SiteAuditCategorySummary {
  key: string;
  label: string;
  /** Distinct rules in this category. */
  issueCount: number;
  /** Distinct affected pages summed across this category's rules. */
  affectedPageCount: number;
  countsBySeverity: Record<Severity, number>;
}

export interface SiteAuditData {
  scores: Awaited<ReturnType<typeof computeWebsiteScores>>;
  /** `null` unless TWO completed crawl runs exist — never a fabricated "0". */
  scoreDeltas: ScoreDeltas | null;
  /** One real point per completed crawl run, oldest first. Never padded or interpolated. */
  scoreHistory: { label: string; value: number }[];

  hasCompletedCrawl: boolean;
  lastCrawl: {
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    pagesCrawled: number | null;
    pagesDiscovered: number | null;
  } | null;
  /** Full run history for the crawl panel — the existing crawl/run-crawl feature, unchanged. */
  crawlRuns: Awaited<ReturnType<typeof listCrawlRuns>>;

  issues: SiteAuditIssue[];
  totalIssueTypes: number;
  /** Sum of each rule's distinct affected pages — issue INSTANCES, not rules. */
  totalAffectedPageInstances: number;
  countsBySeverity: Record<Severity, number>;
  /**
   * Change in distinct-rule counts against the previous completed crawl run.
   * `null` when there is no previous completed run to compare against — a
   * first-ever crawl has no baseline, and reporting "0 change" would claim a
   * comparison that does not exist.
   */
  deltasBySeverity: Record<Severity, number> | null;
  totalIssueTypesDelta: number | null;

  categories: SiteAuditCategorySummary[];
}

function emptySeverityCounts(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

/** The most recent completed crawl runs, newest first. Capped at 5 — each costs a real score aggregation. */
async function recentCompletedRuns(websiteId: string) {
  return db
    .select({ id: crawlRuns.id, completedAt: crawlRuns.completedAt, createdAt: crawlRuns.createdAt })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(5);
}

export const loadSiteAuditData = cache(async (websiteId: string): Promise<SiteAuditData> => {
  const [scores, recommendations, runs, completedRuns] = await Promise.all([
    computeWebsiteScores(websiteId),
    computeWebsiteRecommendations(websiteId),
    listCrawlRuns(websiteId),
    recentCompletedRuns(websiteId),
  ]);

  const runScores = await Promise.all(completedRuns.map((run) => computeCrawlRunScores(run.id, websiteId)));

  const scoreHistory = completedRuns
    .map((run, index) => ({ run, score: runScores[index].overall.score }))
    .filter((entry): entry is { run: (typeof completedRuns)[number]; score: number } => entry.score !== null)
    .reverse()
    .map((entry) => ({
      label: (entry.run.completedAt ?? entry.run.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value: entry.score,
    }));

  const scoreDeltas: ScoreDeltas | null =
    completedRuns.length >= 2 ? diffScores(runScores[1], runScores[0]) : null;

  // Flatten the tiered recommendations into one severity-then-breadth-ordered
  // list. `buildRecommendations` already applied that ordering within each
  // tier, and SEVERITY_ORDER is the tier order, so concatenating preserves it.
  const issues: SiteAuditIssue[] = SEVERITY_ORDER.flatMap((severity) =>
    recommendations[severity].map((entry) => ({
      ruleKey: entry.ruleKey,
      title: entry.title,
      severity: entry.severity,
      category: entry.category,
      affectedPageCount: entry.affectedPageCount,
      description: entry.description,
      recommendation: entry.recommendation,
      fixExample: entry.fixExample,
      impact: entry.impact,
      affectedPages: entry.affectedPages,
    }))
  );

  const countsBySeverity = emptySeverityCounts();
  for (const issue of issues) countsBySeverity[issue.severity] += 1;

  // Deltas need a genuine baseline. One extra aggregation, and ONLY when a
  // second completed run actually exists.
  let deltasBySeverity: Record<Severity, number> | null = null;
  let totalIssueTypesDelta: number | null = null;
  if (completedRuns.length >= 2) {
    const previous = await computeCrawlRunRecommendations(completedRuns[1].id);
    const previousCounts = emptySeverityCounts();
    for (const severity of SEVERITY_ORDER) previousCounts[severity] = previous[severity].length;

    deltasBySeverity = emptySeverityCounts();
    for (const severity of SEVERITY_ORDER) {
      deltasBySeverity[severity] = countsBySeverity[severity] - previousCounts[severity];
    }
    totalIssueTypesDelta = issues.length - previous.totalRules;
  }

  const categoryMap = new Map<string, SiteAuditCategorySummary>();
  for (const issue of issues) {
    let entry = categoryMap.get(issue.category);
    if (!entry) {
      entry = {
        key: issue.category,
        label: categoryLabel(issue.category),
        issueCount: 0,
        affectedPageCount: 0,
        countsBySeverity: emptySeverityCounts(),
      };
      categoryMap.set(issue.category, entry);
    }
    entry.issueCount += 1;
    entry.affectedPageCount += issue.affectedPageCount;
    entry.countsBySeverity[issue.severity] += 1;
  }

  const categories = Array.from(categoryMap.values()).sort((a, b) => {
    // Most severe first, then by breadth — the same ranking the issue list
    // itself uses, so the summary grid and the list agree about what matters.
    for (const severity of SEVERITY_ORDER) {
      const diff = b.countsBySeverity[severity] - a.countsBySeverity[severity];
      if (diff !== 0) return diff;
    }
    return a.label.localeCompare(b.label);
  });

  const lastRun = runs[0];

  return {
    scores,
    scoreDeltas,
    scoreHistory,
    hasCompletedCrawl: completedRuns.length > 0,
    lastCrawl: lastRun
      ? {
          status: lastRun.status,
          startedAt: lastRun.startedAt,
          completedAt: lastRun.completedAt,
          pagesCrawled: lastRun.pagesCrawled,
          pagesDiscovered: lastRun.pagesDiscovered,
        }
      : null,
    crawlRuns: runs,

    issues,
    totalIssueTypes: issues.length,
    totalAffectedPageInstances: recommendations.totalAffectedPageInstances,
    countsBySeverity,
    deltasBySeverity,
    totalIssueTypesDelta,
    categories,
  };
});

/** The tab bar shared by all three Site Audit routes. */
export function siteAuditTabs(websiteId: string, issueCount: number) {
  const base = `/websites/${websiteId}/site-audit`;
  return [
    { label: "Overview", href: base },
    { label: "Issues", href: `${base}/issues`, count: issueCount },
  ];
}
