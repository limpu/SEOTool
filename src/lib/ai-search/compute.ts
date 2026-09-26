/**
 * Phase 24 — DB-aware AI Search readiness computation. Live-computed (no
 * caching, no new table beyond the `pages` content-structure columns added
 * by this phase's migration) — same precedent as Phase 22's
 * `src/lib/scoring/compute.ts`: reading already-persisted rows and doing
 * in-memory arithmetic is cheap.
 */

import { db } from "@/lib/db";
import { crawlRuns, links, pages, schemas } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { computePageAiSearchReadiness, type PageReadinessResult } from "./readiness";
import { isQuestionHeading } from "@/lib/crawler/extract";

export interface PageAiSearchResult extends PageReadinessResult {
  pageId: string;
  url: string;
}

async function computeForPageIds(pageIds: string[]): Promise<PageAiSearchResult[]> {
  if (pageIds.length === 0) return [];

  const pageRows = await db
    .select({
      id: pages.id,
      url: pages.url,
      wordCount: pages.wordCount,
      headingsJson: pages.headingsJson,
      listCount: pages.listCount,
      tableCount: pages.tableCount,
      definitionListCount: pages.definitionListCount,
      questionHeadingCount: pages.questionHeadingCount,
      hasFaqHeading: pages.hasFaqHeading,
      statusCode: pages.statusCode,
    })
    .from(pages)
    .where(inArray(pages.id, pageIds));

  const schemaRows = await db
    .select({ pageId: schemas.pageId, schemaType: schemas.schemaType, isValid: schemas.isValid })
    .from(schemas)
    .where(inArray(schemas.pageId, pageIds));

  const linkRows = await db
    .select({ pageId: links.pageId, anchorText: links.anchorText, isInternal: links.isInternal })
    .from(links)
    .where(inArray(links.pageId, pageIds));

  const schemasByPage = new Map<string, { schemaType: string | null; isValid: boolean | null }[]>();
  for (const row of schemaRows) {
    const arr = schemasByPage.get(row.pageId) ?? [];
    arr.push({ schemaType: row.schemaType, isValid: row.isValid });
    schemasByPage.set(row.pageId, arr);
  }

  const linksByPage = new Map<string, { anchorText: string | null }[]>();
  for (const row of linkRows) {
    if (row.isInternal) continue;
    const arr = linksByPage.get(row.pageId) ?? [];
    arr.push({ anchorText: row.anchorText });
    linksByPage.set(row.pageId, arr);
  }

  return pageRows
    .filter((p) => p.statusCode !== null && p.statusCode >= 200 && p.statusCode < 300)
    .map((p) => {
      const pageSchemas = schemasByPage.get(p.id) ?? [];
      const schemaTypes = pageSchemas.filter((s) => s.isValid && s.schemaType).map((s) => s.schemaType as string);
      const headings = (p.headingsJson as { level: number; text: string }[] | null) ?? [];
      const externalLinks = linksByPage.get(p.id) ?? [];

      const result = computePageAiSearchReadiness({
        wordCount: p.wordCount ?? 0,
        headings,
        questionHeadings: headings.filter((h) => isQuestionHeading(h.text)).map((h) => h.text),
        hasFaqHeading: p.hasFaqHeading ?? false,
        listCount: p.listCount ?? 0,
        tableCount: p.tableCount ?? 0,
        definitionListCount: p.definitionListCount ?? 0,
        schemaTypes,
        hasFaqSchema: schemaTypes.includes("FAQPage"),
        externalLinks,
      });

      return { pageId: p.id, url: p.url, ...result };
    });
}

/** Page-level AI Search readiness for a single crawled page. */
export async function computePageAiSearch(pageId: string): Promise<PageAiSearchResult | null> {
  const results = await computeForPageIds([pageId]);
  return results[0] ?? null;
}

function averageOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === "number");
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((s, v) => s + v, 0) / valid.length);
}

export interface WebsiteAiSearchResult {
  pagesAssessed: number;
  geo: number | null;
  aeo: number | null;
  aio: number | null;
  pages: PageAiSearchResult[];
}

/**
 * Crawl-run-scoped aggregate — factored out of `computeWebsiteAiSearch` so
 * Stage 2's dashboard/re-test-delta code (which needs the AI Search result
 * for a SPECIFIC crawl run, not just "the latest one") can reuse the exact
 * same aggregation instead of re-deriving it, mirroring the
 * `computeCrawlRunScores` / `computeWebsiteScores` split already established
 * in `src/lib/scoring/compute.ts`.
 */
export async function computeCrawlRunAiSearch(crawlRunId: string): Promise<WebsiteAiSearchResult> {
  const pageRows = await db.select({ id: pages.id }).from(pages).where(eq(pages.crawlRunId, crawlRunId));
  const results = await computeForPageIds(pageRows.map((p) => p.id));

  return {
    pagesAssessed: results.length,
    geo: averageOrNull(results.map((r) => r.geo.score)),
    aeo: averageOrNull(results.map((r) => r.aeo.score)),
    aio: averageOrNull(results.map((r) => r.aio.score)),
    pages: results,
  };
}

/** Website-level: aggregate (average) readiness across every page in the website's most recent completed crawl. */
export async function computeWebsiteAiSearch(websiteId: string): Promise<WebsiteAiSearchResult> {
  const [latestRun] = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(1);

  if (!latestRun) {
    return { pagesAssessed: 0, geo: null, aeo: null, aio: null, pages: [] };
  }

  return computeCrawlRunAiSearch(latestRun.id);
}
