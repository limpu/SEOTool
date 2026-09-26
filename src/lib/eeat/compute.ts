/**
 * Phase 25 — DB-aware E-E-A-T / Trust computation. Same live-computed,
 * no-extra-cache-table precedent as Phase 22's `src/lib/scoring/compute.ts`
 * and Phase 24's `src/lib/ai-search/compute.ts`.
 */

import { db } from "@/lib/db";
import { crawlRuns, pages, schemas } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  computeSiteTrust,
  hasArticleAuthorSchema,
  scoreAuthorSignal,
  findAboutPage,
  findContactPage,
  findPrivacyPage,
  findTermsPage,
  type SiteTrustResult,
  type DimensionResult,
} from "./detect";

/** Same "content-heavy page" bar as Phase 24's AEO/GEO opportunity rules (`src/lib/seo-rules/ai-search.ts`) — thin/navigational pages legitimately have no byline to show. */
const MIN_WORD_COUNT_FOR_AUTHOR_SIGNAL = 300;

export interface PageAuthorResult {
  pageId: string;
  url: string;
  wordCount: number;
  eligible: boolean;
  authorSignal: DimensionResult | null;
}

async function computeForPageIds(pageIds: string[]): Promise<PageAuthorResult[]> {
  if (pageIds.length === 0) return [];

  const pageRows = await db
    .select({
      id: pages.id,
      url: pages.url,
      wordCount: pages.wordCount,
      hasAuthorByline: pages.hasAuthorByline,
      hasRelAuthorLink: pages.hasRelAuthorLink,
      hasVisibleDate: pages.hasVisibleDate,
      statusCode: pages.statusCode,
    })
    .from(pages)
    .where(inArray(pages.id, pageIds));

  const schemaRows = await db
    .select({ pageId: schemas.pageId, schemaType: schemas.schemaType, isValid: schemas.isValid, rawJson: schemas.rawJson })
    .from(schemas)
    .where(inArray(schemas.pageId, pageIds));

  const schemasByPage = new Map<string, { schemaType: string | null; hasAuthorProperty: boolean }[]>();
  for (const row of schemaRows) {
    if (!row.isValid) continue;
    const hasAuthorProperty = !!(row.rawJson && typeof row.rawJson === "object" && "author" in (row.rawJson as Record<string, unknown>));
    const arr = schemasByPage.get(row.pageId) ?? [];
    arr.push({ schemaType: row.schemaType, hasAuthorProperty });
    schemasByPage.set(row.pageId, arr);
  }

  return pageRows
    .filter((p) => p.statusCode !== null && p.statusCode >= 200 && p.statusCode < 300)
    .map((p) => {
      const wordCount = p.wordCount ?? 0;
      const eligible = wordCount >= MIN_WORD_COUNT_FOR_AUTHOR_SIGNAL;
      const articleAuthorSchema = hasArticleAuthorSchema(schemasByPage.get(p.id) ?? []);
      const authorSignal = eligible
        ? scoreAuthorSignal({
            hasAuthorByline: p.hasAuthorByline ?? false,
            hasRelAuthorLink: p.hasRelAuthorLink ?? false,
            hasVisibleDate: p.hasVisibleDate ?? false,
            hasArticleAuthorSchema: articleAuthorSchema,
          })
        : null;
      return { pageId: p.id, url: p.url, wordCount, eligible, authorSignal };
    });
}

export interface WebsiteEeatResult extends SiteTrustResult {
  pagesAssessed: number;
  contentPagesAssessed: number;
  pages: PageAuthorResult[];
}

/** Website-level: About/Contact/Privacy/Terms detection + HTTPS + per-page author signals, aggregated for the most recent completed crawl. */
export async function computeWebsiteEeat(websiteId: string): Promise<WebsiteEeatResult> {
  const [latestRun] = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(1);

  if (!latestRun) {
    const empty = computeSiteTrust({ aboutPage: null, contactPage: null, privacyPage: null, termsPage: null }, false, []);
    return { ...empty, pagesAssessed: 0, contentPagesAssessed: 0, pages: [] };
  }

  const pageRows = await db
    .select({ id: pages.id, url: pages.url, title: pages.title, statusCode: pages.statusCode })
    .from(pages)
    .where(eq(pages.crawlRunId, latestRun.id));

  const successfulPages = pageRows.filter((p) => p.statusCode !== null && p.statusCode >= 200 && p.statusCode < 300);

  const aboutPage = findAboutPage(successfulPages);
  const contactPage = findContactPage(successfulPages);
  const privacyPage = findPrivacyPage(successfulPages);
  const termsPage = findTermsPage(successfulPages);

  const isHttps = successfulPages.some((p) => {
    try {
      return new URL(p.url).protocol === "https:";
    } catch {
      return false;
    }
  });

  const authorResults = await computeForPageIds(successfulPages.map((p) => p.id));
  const authorSignalScores = authorResults.filter((r) => r.authorSignal !== null).map((r) => r.authorSignal!.score!);

  const siteTrust = computeSiteTrust({ aboutPage, contactPage, privacyPage, termsPage }, isHttps, authorSignalScores);

  return {
    ...siteTrust,
    pagesAssessed: successfulPages.length,
    contentPagesAssessed: authorResults.filter((r) => r.eligible).length,
    pages: authorResults,
  };
}
