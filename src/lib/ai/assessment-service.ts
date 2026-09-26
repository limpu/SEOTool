/**
 * Phase 29 — Page Assessment service. Explicitly-triggered async job (same
 * "pending -> running -> completed/failed" shape as
 * `src/lib/pagespeed/run-audit.ts`) that fills Phase 24's deferred
 * Answerability / Semantic Completeness / Direct Answers / Answer
 * Completeness dimensions using the AI gateway. Every result row is stored
 * only in `ai_page_assessments` — never written into `pages`/`seo_issues`.
 */

import { db } from "@/lib/db";
import { aiPageAssessments, pages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { safeFetch, CrawlFetchError } from "@/lib/crawler/safe-fetch";
import { extractBodyText } from "@/lib/crawler/extract";
import { buildPageAssessmentPrompt, PAGE_ASSESSMENT_PROMPT_VERSION } from "./prompts";
import { PageAssessmentSchema } from "./schemas";
import { runAiTask } from "./client";
import { AiUnavailableError } from "./errors";

export class PageNotFoundError extends Error {
  constructor() {
    super("Page not found.");
  }
}

export async function startPageAssessment(pageId: string, userId: string) {
  const [page] = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  if (!page) throw new PageNotFoundError();

  const [row] = await db
    .insert(aiPageAssessments)
    .values({
      pageId: page.id,
      websiteId: page.websiteId,
      requestedByUserId: userId,
      status: "pending",
      promptVersion: PAGE_ASSESSMENT_PROMPT_VERSION,
    })
    .returning();

  void runOneAssessment(row.id, userId).catch((err) => {
    console.error(`AI page assessment ${row.id} failed unexpectedly:`, err);
  });

  return row;
}

export async function listAssessmentsForPage(pageId: string) {
  return db
    .select()
    .from(aiPageAssessments)
    .where(eq(aiPageAssessments.pageId, pageId))
    .orderBy(aiPageAssessments.createdAt);
}

async function runOneAssessment(assessmentId: string, userId: string) {
  const [assessment] = await db.select().from(aiPageAssessments).where(eq(aiPageAssessments.id, assessmentId)).limit(1);
  if (!assessment) return;

  await db.update(aiPageAssessments).set({ status: "running", startedAt: new Date() }).where(eq(aiPageAssessments.id, assessmentId));

  try {
    const [page] = await db.select().from(pages).where(eq(pages.id, assessment.pageId)).limit(1);
    if (!page) throw new Error("Page no longer exists.");

    let bodyText: string;
    try {
      const fetched = await safeFetch(page.url, { timeoutMs: 15_000 });
      bodyText = extractBodyText(fetched.body);
    } catch (err) {
      const reason = err instanceof CrawlFetchError ? err.message : err instanceof Error ? err.message : String(err);
      throw new Error(`Could not fetch page content for AI analysis: ${reason}`);
    }

    if (bodyText.length < 20) {
      throw new Error("Page has too little extractable text content to assess.");
    }

    const { system, prompt } = buildPageAssessmentPrompt({
      url: page.url,
      title: page.title,
      headings: page.headingsJson ?? [],
      bodyText,
    });

    const result = await runAiTask({
      taskType: "page_answerability_assessment",
      userId,
      system,
      prompt,
      schema: PageAssessmentSchema,
    });

    await db
      .update(aiPageAssessments)
      .set({
        status: "completed",
        completedAt: new Date(),
        provider: result.provider,
        model: result.model,
        answerability: result.data.answerability,
        semanticCompleteness: result.data.semanticCompleteness,
        directAnswers: result.data.directAnswers,
        answerCompleteness: result.data.answerCompleteness,
        rawResponse: { text: result.raw.slice(0, 5000) },
      })
      .where(eq(aiPageAssessments.id, assessmentId));
  } catch (err) {
    const message =
      err instanceof AiUnavailableError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    await db
      .update(aiPageAssessments)
      .set({ status: "failed", completedAt: new Date(), error: message })
      .where(eq(aiPageAssessments.id, assessmentId));
  }
}
