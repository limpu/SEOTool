/**
 * Phase 29 — Zod schemas that validate structured AI JSON output. AI output
 * is untrusted input (same standing as any external API response elsewhere
 * in this codebase) — it is never trusted or stored until it parses
 * against one of these schemas. A model that returns malformed JSON, wrong
 * types, or out-of-range scores fails validation and the calling service
 * records the assessment as "failed" rather than persisting a guess.
 */

import { z } from "zod";

const dimensionSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1).max(1000),
});

/** Fills Phase 24's deferred Answerability / Semantic Completeness / Direct Answers / Answer Completeness dimensions. */
export const PageAssessmentSchema = z.object({
  answerability: dimensionSchema,
  semanticCompleteness: dimensionSchema,
  directAnswers: dimensionSchema,
  answerCompleteness: dimensionSchema,
});
export type PageAssessment = z.infer<typeof PageAssessmentSchema>;

const gapItemSchema = z.object({
  topic: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  evidence: z.string().min(1).max(500),
});

/** Fills Phase 28's deferred true topical/semantic content-gap analysis. */
export const ContentGapSchema = z.object({
  summary: z.string().min(1).max(1000),
  gaps: z.array(gapItemSchema).max(25),
});
export type ContentGap = z.infer<typeof ContentGapSchema>;
