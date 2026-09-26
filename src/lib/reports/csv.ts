/**
 * Phase 30 — Reports: CSV export builders.
 *
 * Three separate, purpose-built CSVs rather than one giant flattened sheet
 * (per the task's own guidance) — each answers a distinct spreadsheet
 * question a client/user would actually want to filter/sort/pivot on:
 *
 *   1. "issues"   — one row per distinct rule (issue type), aggregated
 *                   across the site's most recent completed crawl, with
 *                   rule key / category / severity / affected page count /
 *                   description. Directly derived from the same
 *                   `TieredRecommendations` structure the JSON export and
 *                   the Recommendations panel already use (Phase 23) — not
 *                   a second aggregation of `seo_issues`.
 *   2. "scores"   — one row per completed crawl run, chronological, so a
 *                   user can see score movement over time. Computed by
 *                   calling Phase 22's `computeCrawlRunScores` once per
 *                   historical completed crawl run (no score history table
 *                   exists — Phase 22 documented this as a known
 *                   limitation — so this is assembled live from the crawl
 *                   runs that do exist, which is itself real, not guessed).
 *   3. "keywords" — one row per tracked keyword (Phase 27), with its latest
 *                   manual position and/or GSC cross-referenced position,
 *                   each clearly labeled by source.
 *
 * All three go through `buildCsv()`/`escapeCsvField()` (src/lib/reports/
 * escape.ts) for RFC 4180 quoting + CSV-injection neutralization — every
 * field here can originate from real crawled/user-entered text (rule
 * titles/descriptions are static and trusted, but keyword text and target
 * URLs are user-entered, and evidence/description strings can echo crawled
 * page content).
 */

import { buildCsv } from "./escape";
import type { WebsiteReport } from "./assemble";
import { db } from "@/lib/db";
import { computeCrawlRunScores } from "@/lib/scoring/compute";
import { crawlRuns } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

export function buildIssuesCsv(report: WebsiteReport): string {
  const rows: { ruleKey: string; category: string; severity: string; affectedPages: number; title: string; description: string }[] = [];
  for (const tier of ["critical", "high", "medium", "low", "info"] as const) {
    for (const entry of report.recommendations[tier]) {
      rows.push({
        ruleKey: entry.ruleKey,
        category: entry.category,
        severity: entry.severity,
        affectedPages: entry.affectedPageCount,
        title: entry.title,
        description: entry.description,
      });
    }
  }

  return buildCsv(
    [
      { key: "ruleKey", label: "Rule Key" },
      { key: "category", label: "Category" },
      { key: "severity", label: "Severity" },
      { key: "affectedPages", label: "Affected Pages" },
      { key: "title", label: "Title" },
      { key: "description", label: "Description" },
    ],
    rows
  );
}

interface ScoreHistoryRow {
  crawlRunId: string;
  completedAt: string;
  technical: number | null;
  onPage: number | null;
  performance: number | null;
  overall: number | null;
}

/**
 * Scores over time — computed live per completed crawl run rather than
 * read from a stored history table (none exists; see file header). Every
 * completed crawl run for this website is fetched and scored via Phase 22's
 * own `computeCrawlRunScores`, exactly the same function the live scoring
 * API uses for a single run — this just calls it once per historical run.
 */
export async function buildScoreHistoryCsv(websiteId: string): Promise<string> {
  const runs = await db
    .select({ id: crawlRuns.id, completedAt: crawlRuns.completedAt })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(asc(crawlRuns.createdAt));

  const rows: ScoreHistoryRow[] = [];
  for (const run of runs) {
    const scores = await computeCrawlRunScores(run.id, websiteId);
    rows.push({
      crawlRunId: run.id,
      completedAt: run.completedAt ? run.completedAt.toISOString() : "",
      technical: scores.technical.score,
      onPage: scores.onPage.score,
      performance: scores.performance.score,
      overall: scores.overall.score,
    });
  }

  return buildCsv(
    [
      { key: "crawlRunId", label: "Crawl Run ID" },
      { key: "completedAt", label: "Completed At" },
      { key: "technical", label: "Technical Score" },
      { key: "onPage", label: "On-Page Score" },
      { key: "performance", label: "Performance Score" },
      { key: "overall", label: "Overall Score" },
    ],
    rows
  );
}

export function buildKeywordsCsv(report: WebsiteReport): string {
  return buildCsv(
    [
      { key: "keyword", label: "Keyword" },
      { key: "targetUrl", label: "Target URL" },
      { key: "country", label: "Country" },
      { key: "latestManualPosition", label: "Latest Manual Position" },
      { key: "latestManualCheckDate", label: "Latest Manual Check Date" },
      { key: "gscPosition", label: "GSC Position" },
      { key: "gscClicks", label: "GSC Clicks" },
      { key: "gscSource", label: "Source" },
    ],
    report.keywords.keywords
  );
}
