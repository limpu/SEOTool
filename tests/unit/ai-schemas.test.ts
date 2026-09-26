import { describe, expect, it } from "vitest";
import { PageAssessmentSchema, ContentGapSchema } from "@/lib/ai/schemas";

const validDimension = { score: 72, confidence: 0.8, explanation: "Because the text directly answers the heading." };

describe("PageAssessmentSchema — valid AI responses", () => {
  it("accepts a well-formed response", () => {
    const result = PageAssessmentSchema.safeParse({
      answerability: validDimension,
      semanticCompleteness: validDimension,
      directAnswers: validDimension,
      answerCompleteness: validDimension,
    });
    expect(result.success).toBe(true);
  });
});

describe("PageAssessmentSchema — malformed AI responses (untrusted input)", () => {
  it("rejects a score out of 0-100 range", () => {
    const result = PageAssessmentSchema.safeParse({
      answerability: { ...validDimension, score: 150 },
      semanticCompleteness: validDimension,
      directAnswers: validDimension,
      answerCompleteness: validDimension,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a confidence outside 0-1", () => {
    const result = PageAssessmentSchema.safeParse({
      answerability: { ...validDimension, confidence: 5 },
      semanticCompleteness: validDimension,
      directAnswers: validDimension,
      answerCompleteness: validDimension,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing dimension entirely", () => {
    const result = PageAssessmentSchema.safeParse({
      answerability: validDimension,
      semanticCompleteness: validDimension,
      directAnswers: validDimension,
      // answerCompleteness missing
    });
    expect(result.success).toBe(false);
  });

  it("rejects a score that is a string instead of a number (a real failure mode for text-generating models)", () => {
    const result = PageAssessmentSchema.safeParse({
      answerability: { ...validDimension, score: "high" },
      semanticCompleteness: validDimension,
      directAnswers: validDimension,
      answerCompleteness: validDimension,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a completely different shape (e.g. the model returned prose, not JSON)", () => {
    const result = PageAssessmentSchema.safeParse("Sure, here is my assessment: the page is pretty good.");
    expect(result.success).toBe(false);
  });
});

describe("ContentGapSchema", () => {
  it("accepts a well-formed response with gaps", () => {
    const result = ContentGapSchema.safeParse({
      summary: "The competitor covers pricing tiers in more depth.",
      gaps: [{ topic: "Pricing tiers", description: "Competitor lists 3 tiers with feature breakdowns.", evidence: "\"Basic, Pro, Enterprise\" section" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty gaps array (no meaningful gaps found)", () => {
    const result = ContentGapSchema.safeParse({ summary: "No significant gaps found.", gaps: [] });
    expect(result.success).toBe(true);
  });

  it("rejects a gap item missing required fields", () => {
    const result = ContentGapSchema.safeParse({ summary: "x", gaps: [{ topic: "Pricing" }] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 25 gaps (guards against a runaway/garbage generation)", () => {
    const gaps = Array.from({ length: 26 }, (_, i) => ({ topic: `Topic ${i}`, description: "d", evidence: "e" }));
    const result = ContentGapSchema.safeParse({ summary: "x", gaps });
    expect(result.success).toBe(false);
  });
});
