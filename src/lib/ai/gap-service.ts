/**
 * Phase 29 — Content Gap Analysis service. Fills Phase 28's deliberately
 * deferred true topical/semantic content-gap analysis: given the user's
 * page content and a competitor's page content (both already crawled),
 * finds topics the competitor covers that the user's page doesn't. Same
 * explicitly-triggered async job shape as `assessment-service.ts`. Results
 * live only in `ai_content_gap_analyses` — never blended into Phase 28's
 * deterministic `buildStructuralComparison` output.
 */

import { db } from "@/lib/db";
import { aiContentGapAnalyses, crawlRuns, pages } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { safeFetch, CrawlFetchError } from "@/lib/crawler/safe-fetch";
import { extractBodyText } from "@/lib/crawler/extract";
import { buildContentGapPrompt, CONTENT_GAP_PROMPT_VERSION } from "./prompts";
import { ContentGapSchema } from "./schemas";
import { runAiTask } from "./client";
import { AiUnavailableError } from "./errors";

export class NoCrawledPageError extends Error {
  constructor(whose: string = "your site") {
    super(`No completed crawl page found for ${whose}. Crawl it first.`);
  }
}

/**
 * Picks the "best" page to compare for one side: prefers the page whose URL
 * exactly matches the website's root URL (its homepage) from the most
 * recent completed crawl; falls back to the first crawled page by earliest
 * `createdAt` (crawl BFS order, so this is normally the homepage anyway) if
 * no exact root match exists. Never guesses across an incomplete/failed
 * crawl.
 */
async function pickComparablePage(websiteId: string, rootUrl: string) {
  const [latestRun] = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(1);
  if (!latestRun) return null;

  const crawledPages = await db.select().from(pages).where(eq(pages.crawlRunId, latestRun.id)).orderBy(pages.createdAt);
  if (crawledPages.length === 0) return null;

  const normalize = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  const homepage = crawledPages.find((p) => normalize(p.url) === normalize(rootUrl));
  return homepage ?? crawledPages[0];
}

export async function startContentGapAnalysis(
  websiteId: string,
  websiteUrl: string,
  competitorId: string,
  competitorUrl: string,
  userId: string,
  explicitPageIds?: { pageId?: string; competitorPageId?: string }
) {
  const yourPage = explicitPageIds?.pageId
    ? (await db.select().from(pages).where(eq(pages.id, explicitPageIds.pageId)).limit(1))[0]
    : await pickComparablePage(websiteId, websiteUrl);
  if (!yourPage) throw new Error("No completed crawl page found for your site. Crawl it first.");

  const competitorPage = explicitPageIds?.competitorPageId
    ? (await db.select().from(pages).where(eq(pages.id, explicitPageIds.competitorPageId)).limit(1))[0]
    : await pickComparablePage(competitorId, competitorUrl);
  if (!competitorPage) throw new Error("No completed crawl page found for the competitor. Crawl it first.");

  const [row] = await db
    .insert(aiContentGapAnalyses)
    .values({
      websiteId,
      competitorId,
      pageId: yourPage.id,
      competitorPageId: competitorPage.id,
      yourUrl: yourPage.url,
      competitorUrl: competitorPage.url,
      requestedByUserId: userId,
      status: "pending",
      promptVersion: CONTENT_GAP_PROMPT_VERSION,
    })
    .returning();

  void runOneGapAnalysis(row.id, userId).catch((err) => {
    console.error(`AI content gap analysis ${row.id} failed unexpectedly:`, err);
  });

  return row;
}

export async function listGapAnalyses(websiteId: string, competitorId: string) {
  return db
    .select()
    .from(aiContentGapAnalyses)
    .where(and(eq(aiContentGapAnalyses.websiteId, websiteId), eq(aiContentGapAnalyses.competitorId, competitorId)))
    .orderBy(aiContentGapAnalyses.createdAt);
}

async function fetchBodyTextOrThrow(url: string, label: string): Promise<string> {
  try {
    const fetched = await safeFetch(url, { timeoutMs: 15_000 });
    const text = extractBodyText(fetched.body);
    if (text.length < 20) throw new Error(`${label} has too little extractable text content.`);
    return text;
  } catch (err) {
    const reason = err instanceof CrawlFetchError ? err.message : err instanceof Error ? err.message : String(err);
    throw new Error(`Could not fetch ${label} for AI analysis: ${reason}`);
  }
}

async function runOneGapAnalysis(id: string, userId: string) {
  const [row] = await db.select().from(aiContentGapAnalyses).where(eq(aiContentGapAnalyses.id, id)).limit(1);
  if (!row) return;

  await db.update(aiContentGapAnalyses).set({ status: "running", startedAt: new Date() }).where(eq(aiContentGapAnalyses.id, id));

  try {
    if (!row.yourUrl || !row.competitorUrl) throw new Error("Missing page URLs for comparison.");

    const [yourBodyText, competitorBodyText] = await Promise.all([
      fetchBodyTextOrThrow(row.yourUrl, "your page"),
      fetchBodyTextOrThrow(row.competitorUrl, "the competitor's page"),
    ]);

    const { system, prompt } = buildContentGapPrompt({
      yourUrl: row.yourUrl,
      yourBodyText,
      competitorUrl: row.competitorUrl,
      competitorBodyText,
    });

    const result = await runAiTask({
      taskType: "content_gap_analysis",
      userId,
      system,
      prompt,
      schema: ContentGapSchema,
    });

    await db
      .update(aiContentGapAnalyses)
      .set({
        status: "completed",
        completedAt: new Date(),
        provider: result.provider,
        model: result.model,
        summary: result.data.summary,
        gaps: result.data.gaps,
        rawResponse: { text: result.raw.slice(0, 5000) },
      })
      .where(eq(aiContentGapAnalyses.id, id));
  } catch (err) {
    const message = err instanceof AiUnavailableError ? err.message : err instanceof Error ? err.message : String(err);
    await db
      .update(aiContentGapAnalyses)
      .set({ status: "failed", completedAt: new Date(), error: message })
      .where(eq(aiContentGapAnalyses.id, id));
  }
}
