import { cache } from "react";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { crawlRuns } from "@/lib/db/schema";
import { getCompetitorForUser, listCompetitorsForWebsite, type Website } from "@/lib/websites/queries";
import { computeCompetitorComparison, type CompetitorComparisonResult } from "@/lib/competitor/queries";

/**
 * Stage 3B — the server-side loader for the Competitors report.
 *
 * A THIRD record-based module with no rules and no `seo_issues` rows of its
 * own, so like Keywords and Search Console it does not go through
 * `_module-report/data.ts`.
 *
 * ─── The deliberate split between the list and the detail ────────────────
 *
 * `computeCompetitorComparison` is genuinely expensive: it builds a
 * structural snapshot AND runs `computeWebsiteScores` AND
 * `computeWebsiteAiSearch` for BOTH sides of the pair. Running it once per
 * competitor to populate a list would multiply the owned site's entire scoring
 * pipeline by the number of competitors, for a table that only needs to say
 * "this competitor has been crawled, N pages, here is the link".
 *
 * So the LIST loads one cheap indexed read of each competitor's latest crawl
 * run, and the DETAIL page runs the real comparison for the single pair the
 * user asked about. Nothing is estimated or cached to fake the difference.
 */

export interface CompetitorSummary {
  id: string;
  name: string;
  url: string;
  domain: string;
  createdAt: Date;
  /** The most recent crawl run of any status, or `null` if never crawled. */
  latestRun: {
    id: string;
    status: string;
    pagesCrawled: number | null;
    createdAt: Date;
    completedAt: Date | null;
  } | null;
  /** The most recent COMPLETED run — the only one a comparison can read. */
  latestCompletedRun: {
    id: string;
    pagesCrawled: number | null;
    completedAt: Date | null;
  } | null;
}

export interface CompetitorsReportData {
  competitors: CompetitorSummary[];
  /** True when the owned site itself has a completed crawl to compare against. */
  ownSiteCrawled: boolean;
  ownSitePagesCrawled: number | null;
  ownSiteCrawledAt: Date | null;
}

export const loadCompetitorsReport = cache(
  async (userId: string, websiteId: string): Promise<CompetitorsReportData> => {
    const competitors = await listCompetitorsForWebsite(userId, websiteId);
    const ids = competitors.map((entry) => entry.id);

    // One query for every competitor's runs plus the owned site's, rather than
    // one per competitor.
    const runs =
      ids.length === 0
        ? await db
            .select()
            .from(crawlRuns)
            .where(eq(crawlRuns.websiteId, websiteId))
            .orderBy(desc(crawlRuns.createdAt))
        : await db
            .select()
            .from(crawlRuns)
            .where(inArray(crawlRuns.websiteId, [...ids, websiteId]))
            .orderBy(desc(crawlRuns.createdAt));

    const ownCompleted = runs.find((run) => run.websiteId === websiteId && run.status === "completed") ?? null;

    return {
      competitors: competitors.map((competitor: Website) => {
        const own = runs.filter((run) => run.websiteId === competitor.id);
        const completed = own.find((run) => run.status === "completed") ?? null;
        return {
          id: competitor.id,
          name: competitor.name,
          url: competitor.url,
          domain: competitor.domain,
          createdAt: competitor.createdAt,
          latestRun: own[0]
            ? {
                id: own[0].id,
                status: own[0].status,
                pagesCrawled: own[0].pagesCrawled,
                createdAt: own[0].createdAt,
                completedAt: own[0].completedAt,
              }
            : null,
          latestCompletedRun: completed
            ? { id: completed.id, pagesCrawled: completed.pagesCrawled, completedAt: completed.completedAt }
            : null,
        };
      }),
      ownSiteCrawled: ownCompleted !== null,
      ownSitePagesCrawled: ownCompleted?.pagesCrawled ?? null,
      ownSiteCrawledAt: ownCompleted?.completedAt ?? null,
    };
  }
);

export interface CompetitorDetailData {
  competitor: Website;
  summary: CompetitorSummary;
  /**
   * The real Phase 28 comparison. `null` ONLY when neither side has a
   * completed crawl — in which case there is genuinely nothing measured to
   * compare, and the page says so rather than rendering a table of zeros.
   */
  comparison: CompetitorComparisonResult | null;
  /** Every crawl run recorded for this competitor, newest first. */
  runs: { id: string; status: string; pagesCrawled: number | null; createdAt: Date; completedAt: Date | null }[];
}

export const loadCompetitorDetail = cache(
  async (
    userId: string,
    websiteId: string,
    websiteName: string,
    competitorId: string
  ): Promise<CompetitorDetailData | null> => {
    const competitor = await getCompetitorForUser(userId, websiteId, competitorId);
    if (!competitor) return null;

    const runs = await db
      .select()
      .from(crawlRuns)
      .where(eq(crawlRuns.websiteId, competitor.id))
      .orderBy(desc(crawlRuns.createdAt))
      .limit(10);

    const [ownCompleted] = await db
      .select({ id: crawlRuns.id })
      .from(crawlRuns)
      .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
      .orderBy(desc(crawlRuns.createdAt))
      .limit(1);

    const competitorCompleted = runs.find((run) => run.status === "completed") ?? null;

    const comparison =
      ownCompleted || competitorCompleted
        ? await computeCompetitorComparison(websiteId, websiteName, competitor.id, competitor.name)
        : null;

    return {
      competitor,
      summary: {
        id: competitor.id,
        name: competitor.name,
        url: competitor.url,
        domain: competitor.domain,
        createdAt: competitor.createdAt,
        latestRun: runs[0]
          ? {
              id: runs[0].id,
              status: runs[0].status,
              pagesCrawled: runs[0].pagesCrawled,
              createdAt: runs[0].createdAt,
              completedAt: runs[0].completedAt,
            }
          : null,
        latestCompletedRun: competitorCompleted
          ? {
              id: competitorCompleted.id,
              pagesCrawled: competitorCompleted.pagesCrawled,
              completedAt: competitorCompleted.completedAt,
            }
          : null,
      },
      comparison,
      runs: runs.map((run) => ({
        id: run.id,
        status: run.status,
        pagesCrawled: run.pagesCrawled,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
      })),
    };
  }
);
